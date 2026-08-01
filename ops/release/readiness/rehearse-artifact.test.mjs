import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  artifactRehearsalRuntimeEnvironment,
  DEPLOY_UNIT_REHEARSAL_ENVIRONMENT_KEYS,
  probeRuntimeEndpoint,
} from "./rehearse-artifact.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");

function runtimeEnvironment(target) {
  const rehearsalRoot = "/tmp/workspace-rehearsal-contract";
  return artifactRehearsalRuntimeEnvironment({
    baseEnvironment: Object.fromEntries(DEPLOY_UNIT_REHEARSAL_ENVIRONMENT_KEYS.map((key) => [key, "inherited-must-not-leak"])),
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
  for (const key of DEPLOY_UNIT_REHEARSAL_ENVIRONMENT_KEYS) assert.equal(environment[key], undefined);
});

test("runtime probe fails within seconds after the same 5xx repeats", async () => {
  let requests = 0;
  let sleeps = 0;
  await assert.rejects(
    () => probeRuntimeEndpoint(
      "http://127.0.0.1:4312/workspace/api/internal/health",
      () => false,
      { exitCode: null, signalCode: null },
      () => "same stack",
      {
        fetchImpl: async () => {
          requests += 1;
          return new Response('{"error":"identity missing"}', { status: 503 });
        },
        sleep: async () => { sleeps += 1; },
      },
    ),
    /repeated identical 5xx.*503.*identity missing.*same stack/,
  );
  assert.equal(requests, 3);
  assert.equal(sleeps, 2);
});
