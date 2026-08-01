import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  artifactRehearsalRuntimeEnvironment,
  DEPLOY_UNIT_IDENTITY_ENVIRONMENT_KEYS,
  DEPLOY_UNIT_REHEARSAL_ENVIRONMENT_KEYS,
  prepareArtifactRehearsalRuntime,
  probeRuntimeEndpoint,
  terminateRuntimeChild,
} from "./rehearse-artifact.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");

function runtimeEnvironment(target) {
  const rehearsalRoot = "/tmp/workspace-rehearsal-contract";
  return artifactRehearsalRuntimeEnvironment({
    baseEnvironment: {
      ...Object.fromEntries(DEPLOY_UNIT_IDENTITY_ENVIRONMENT_KEYS.map((key) => [key, "inherited-must-not-leak"])),
      WORKSPACE_INTERNAL_ORIGIN: "https://gateway.example.test",
      PG_POOL_MAX: "11",
      PG_APPLICATION_NAME: "workspace-monolith",
    },
    identity: target === "monolith" ? null : {
      privateKeyFile: `${rehearsalRoot}/identity/private/news.pem`,
      trustedPublicKeysFile: `${rehearsalRoot}/identity/trusted-public-keys.json`,
      replayDirectory: `${rehearsalRoot}/identity/replay/news`,
    },
    manifest: { runtime: { capacity: { databasePoolMax: 7 } } },
    options: {
      artifact: "/tmp/news.tgz",
      manifest: "/tmp/news.manifest.json",
      source: "a".repeat(40),
      target,
    },
    port: 4312,
    rehearsalRoot: target === "monolith" ? null : rehearsalRoot,
    runtime: { version: "news-candidate" },
  });
}

test("unit rehearsal injects the same runtime identity surface as apply-deploy-unit", () => {
  const environment = runtimeEnvironment("news");
  assert.deepEqual(Object.fromEntries(DEPLOY_UNIT_REHEARSAL_ENVIRONMENT_KEYS.map((key) => [key, environment[key]])), {
    WORKSPACE_DEPLOY_UNIT_ID: "news",
    WORKSPACE_DEPLOY_SLOT: "blue",
    WORKSPACE_DEPLOY_CURRENT_STATE_FILE: "/tmp/workspace-rehearsal-contract/gateway/current/unit-states/news.json",
    WORKSPACE_INTERNAL_SIGNING_PRIVATE_KEY_FILE: "/tmp/workspace-rehearsal-contract/identity/private/news.pem",
    WORKSPACE_INTERNAL_TRUSTED_PUBLIC_KEYS_FILE: "/tmp/workspace-rehearsal-contract/identity/trusted-public-keys.json",
    WORKSPACE_INTERNAL_REPLAY_DIRECTORY: "/tmp/workspace-rehearsal-contract/identity/replay/news",
    WORKSPACE_INTERNAL_ORIGIN: "http://127.0.0.1:4312",
    PG_POOL_MAX: "7",
    PG_APPLICATION_NAME: "workspace-news-blue",
  });
  assert.deepEqual({
    PORT: environment.PORT,
    HOSTNAME: environment.HOSTNAME,
    BUILD_VERSION: environment.BUILD_VERSION,
    NEXT_PUBLIC_BUILD_VERSION: environment.NEXT_PUBLIC_BUILD_VERSION,
  }, {
    PORT: "4312",
    HOSTNAME: "127.0.0.1",
    BUILD_VERSION: "news-candidate",
    NEXT_PUBLIC_BUILD_VERSION: "news-candidate",
  });
  const apply = fs.readFileSync(path.join(repositoryRoot, "ops/apply-deploy-unit.sh"), "utf8");
  const startReleaseEnvironment = apply.slice(
    apply.indexOf("  load_runtime_environment\n", apply.indexOf("start_release()")),
    apply.indexOf("    pm2 start", apply.indexOf("start_release()")),
  );
  const appliedEnvironmentKeys = [...startReleaseEnvironment.matchAll(/(?:^|\s)([A-Z][A-Z0-9_]*)=/gm)]
    .map((match) => match[1]);
  assert.deepEqual(
    [...new Set(appliedEnvironmentKeys)].sort(),
    [
      "PORT",
      "HOSTNAME",
      "BUILD_VERSION",
      "NEXT_PUBLIC_BUILD_VERSION",
      ...DEPLOY_UNIT_REHEARSAL_ENVIRONMENT_KEYS,
    ].sort(),
    "rehearsal and production start_release environment keys drifted",
  );
  for (const contract of [
    /WORKSPACE_DEPLOY_UNIT_ID="\$UNIT_ID"/,
    /WORKSPACE_DEPLOY_SLOT="\$slot"/,
    /WORKSPACE_DEPLOY_CURRENT_STATE_FILE="\$CURRENT_STATE_FILE"/,
    /WORKSPACE_INTERNAL_SIGNING_PRIVATE_KEY_FILE="\$INTERNAL_SIGNING_PRIVATE_KEY_FILE"/,
    /WORKSPACE_INTERNAL_TRUSTED_PUBLIC_KEYS_FILE="\$INTERNAL_TRUSTED_PUBLIC_KEYS_FILE"/,
    /WORKSPACE_INTERNAL_REPLAY_DIRECTORY="\$INTERNAL_REPLAY_DIRECTORY"/,
    /WORKSPACE_INTERNAL_ORIGIN="\$\{WORKSPACE_INTERNAL_ORIGIN:-\$\{WORKSPACE_PUBLIC_ORIGIN:-http:\/\/127\.0\.0\.1\}\}"/,
    /PG_POOL_MAX="\$database_pool_max"/,
    /PG_APPLICATION_NAME="workspace-\$UNIT_ID-\$slot"/,
  ]) assert.match(apply, contract);
});

test("monolith rehearsal does not inherit deploy-unit runtime identity", () => {
  const environment = runtimeEnvironment("monolith");
  for (const key of DEPLOY_UNIT_IDENTITY_ENVIRONMENT_KEYS) assert.equal(environment[key], undefined);
  assert.equal(environment.WORKSPACE_INTERNAL_ORIGIN, "https://gateway.example.test");
  assert.equal(environment.PG_POOL_MAX, "11");
  assert.equal(environment.PG_APPLICATION_NAME, "workspace-monolith");
});

test("runtime probe tolerates repeated transient 5xx and then succeeds", async () => {
  let requests = 0;
  let sleeps = 0;
  const response = await probeRuntimeEndpoint(
    "http://127.0.0.1:4312/workspace/api/internal/health",
    (body) => JSON.parse(body).status === "ok",
    { exitCode: null, signalCode: null },
    () => "temporary database warmup",
    {
      fetchImpl: async () => {
        requests += 1;
        return requests <= 3
          ? new Response('{"error":"warming"}', { status: 503 })
          : new Response('{"status":"ok"}', { status: 200 });
      },
      sleep: async () => { sleeps += 1; },
    },
  );
  assert.equal(response, '{"status":"ok"}');
  assert.equal(requests, 4);
  assert.equal(sleeps, 3);
});

test("runtime probe fails immediately on a deploy identity contract error", async () => {
  let requests = 0;
  await assert.rejects(() => probeRuntimeEndpoint(
    "http://127.0.0.1:4312/workspace/api/internal/health",
    () => false,
    { exitCode: null, signalCode: null },
    () => "WORKSPACE_DEPLOY_UNIT_ID must equal generated deploy unit id news",
    {
      fetchImpl: async () => {
        requests += 1;
        return new Response("Internal Server Error", { status: 500 });
      },
      sleep: async () => assert.fail("fatal contract errors must not sleep"),
    },
  ), /runtime contract failed.*WORKSPACE_DEPLOY_UNIT_ID must equal/);
  assert.equal(requests, 1);
});

test("unit rehearsal creates and removes a real temporary identity", () => {
  const prepared = prepareArtifactRehearsalRuntime({
    manifest: { runtime: { capacity: { databasePoolMax: 7 } } },
    options: { artifact: "/tmp/news.tgz", manifest: "/tmp/news.json", source: "a".repeat(40), target: "news" },
    port: 4312,
    runtime: { version: "news-candidate" },
  });
  assert.ok(fs.existsSync(prepared.environment.WORKSPACE_INTERNAL_SIGNING_PRIVATE_KEY_FILE));
  assert.ok(fs.existsSync(prepared.environment.WORKSPACE_INTERNAL_TRUSTED_PUBLIC_KEYS_FILE));
  assert.ok(fs.statSync(prepared.environment.WORKSPACE_INTERNAL_REPLAY_DIRECTORY).isDirectory());
  assert.ok(fs.statSync(path.dirname(prepared.environment.WORKSPACE_DEPLOY_CURRENT_STATE_FILE)).isDirectory());
  const root = prepared.root;
  prepared.cleanup();
  assert.equal(fs.existsSync(root), false);
});

test("runtime child escalates from SIGTERM to SIGKILL after its grace period", async () => {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  const signals = [];
  child.kill = (signal) => {
    signals.push(signal);
    if (signal === "SIGKILL") {
      child.signalCode = signal;
      queueMicrotask(() => child.emit("exit", null, signal));
    }
  };
  await terminateRuntimeChild(child, {
    schedule(callback) { callback(); return 1; },
    cancel() {},
  });
  assert.deepEqual(signals, ["SIGTERM", "SIGKILL"]);
});
