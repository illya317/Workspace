import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { ASSISTANT_RUNTIME_DESCRIPTOR } from "./assistant-runtime.mjs";
import { createControlPlaneReceipt, writeControlPlaneReceipt } from "./control-plane-receipt.mjs";
import {
  createDeployUnitArtifactManifest,
  readDeployUnitState,
  writePrivateJson,
} from "./deploy-unit-release.mjs";
import { canonicalJson, sha256 } from "./gateway-generation.mjs";

const applyScript = path.resolve("ops/apply-deploy-unit.sh");

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function executable(file, body) {
  writeFileSync(file, body);
  chmodSync(file, 0o755);
}

function graph(activeUnitId = "finance") {
  return {
    schemaVersion: 1,
    lifecycle: {
      gateway: {
        basePath: "/workspace",
        legacyFallback: { host: "127.0.0.1", port: 3000, processName: "workspace" },
      },
    },
    units: [
      {
        id: "workspace-shell",
        kind: "workspace-shell",
        maturity: "planned",
        pageRoutes: ["/"],
        apiPrefixes: ["/api/auth"],
        runtime: {
          engine: "next-standalone",
          processName: "workspace-shell",
          slots: { blue: { port: 3200 }, green: { port: 3300 } },
          assetPrefix: null,
        },
        runtimeDependencies: [],
      },
      {
        id: "finance",
        kind: "business-l1",
        maturity: activeUnitId === "finance" ? "active" : "candidate",
        pageRoutes: ["/finance"],
        apiPrefixes: ["/api/modules/finance"],
        runtime: {
          engine: "next-standalone",
          processName: "workspace-finance",
          slots: { blue: { port: 3201 }, green: { port: 3301 } },
          assetPrefix: "/workspace-static/finance",
        },
        runtimeDependencies: [],
      },
      {
        id: "assistant",
        kind: "headless-runtime",
        maturity: activeUnitId === "assistant" ? "active" : "candidate",
        pageRoutes: [],
        apiPrefixes: ["/api/agent", "/api/integrations"],
        runtime: {
          engine: "next-standalone",
          processName: "workspace-assistant",
          slots: { blue: { port: 3208 }, green: { port: 3308 } },
          assetPrefix: null,
        },
        runtimeDependencies: [],
      },
    ],
  };
}

function tenantAndControlPlane(root) {
  mkdirSync(root, { recursive: true });
  const resourceManifestFile = path.join(root, "resource-defs.json");
  const dataReleaseDir = path.join(root, "data-releases");
  const lifecycleRoot = path.join(root, "lifecycle");
  const tenantManifestFile = path.join(root, "tenant-config-manifest.json");
  mkdirSync(dataReleaseDir);
  for (const relativePath of [
    "node_modules/prisma/package.json",
    "ops/apply-data-release.mjs",
    "ops/data-release.mjs",
    "ops/data-release-handlers.mjs",
    "ops/data-release-transfer.mjs",
    "ops/prisma-genesis-cutover.mjs",
    "scripts/check/check-permission-action-grants.mjs",
    "scripts/check/check-prisma-deploy-status.js",
    "scripts/ci/check-migration-policy.mjs",
    "scripts/lib/agent-workforce-specs.mjs",
    "scripts/migrate/sqlite-to-postgresql.mjs",
    "scripts/provision-agent-workforce.mjs",
    "seed-resources-runtime.mjs",
  ]) {
    const file = path.join(lifecycleRoot, relativePath);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${relativePath}\n`);
  }
  writeFileSync(resourceManifestFile, "{\"resources\":[]}\n");
  writeFileSync(path.join(dataReleaseDir, "one.json"), "{\"id\":\"one\"}\n");
  const tenantFiles = [
    { path: "manifest.json", size: 2, sha256: digest("{}") },
    { path: "config/tenant/profile.json", size: 2, sha256: digest("{}") },
  ];
  const tenantDigest = digest(Buffer.from(tenantFiles.map((file) => `${file.path}\0${file.size}\0${file.sha256}\n`).join("")));
  writePrivateJson(tenantManifestFile, {
    schemaVersion: 2,
    kind: "workspace-tenant-config",
    digest: tenantDigest,
    managedDirectories: [],
    files: tenantFiles,
  });
  const controlPlaneReceiptFile = path.join(root, "control-plane-release.json");
  const receipt = createControlPlaneReceipt({
    target: "production",
    sourceSha: "a".repeat(40),
    sourceTree: "b".repeat(40),
    migrationSetSha256: "c".repeat(64),
    resourceManifestFile,
    dataReleaseDir,
    tenantManifestFile,
    lifecycleRoot,
    completedAt: "2026-07-25T00:00:00.000Z",
  });
  writeControlPlaneReceipt(controlPlaneReceiptFile, receipt);
  return { tenantManifestFile, controlPlaneReceiptFile, receipt };
}

function contract(graphValue, unitId = "finance") {
  const unit = graphValue.units.find((candidate) => candidate.id === unitId);
  assert.ok(unit);
  return {
    schemaVersion: 1,
    kind: "workspace-deploy-unit-contract",
    graphSha256: sha256(canonicalJson(graphValue)),
    id: unit.id,
    unitKind: unit.kind,
    maturity: "active",
    coordination: "available",
    moduleKeys: [unit.id],
    moduleLabels: [unit.id === "finance" ? "财务管理" : "智能体"],
    build: {
      appRoot: `apps/${unit.id}`,
      output: "standalone",
      basePath: "/workspace",
      assetPrefix: unit.runtime.assetPrefix,
      deploymentIdSource: "artifact-manifest",
    },
    runtime: {
      engine: "next-standalone",
      appRoot: `apps/${unit.id}`,
      processName: unit.runtime.processName,
      slots: unit.runtime.slots,
      assetPrefix: unit.runtime.assetPrefix,
      healthPath: "/api/internal/health",
      versionPath: "/api/settings/version",
      capacity: { memoryMiB: 512, databasePoolMax: 4, blueGreenReplicaMultiplier: 2 },
    },
    routes: { pagePrefixes: unit.pageRoutes, apiPrefixes: unit.apiPrefixes, assetPrefix: unit.runtime.assetPrefix },
    compiler: { projects: [], typecheckScopes: [unit.id] },
    checks: { typecheckScopes: [unit.id], e2eSuites: [], unmatchedChangePolicy: "fail-closed" },
    controlPlane: { authority: "workspace-control-plane-job", policy: "require-existing", minimumSchemaReceipt: "required-before-unit-start" },
    readiness: { contributorBlockers: [] },
  };
}

function buildStaging(files, version, sourceCharacter, unitId = "finance") {
  const staging = path.join(files.root, `staging-${version}`);
  const payload = path.join(files.root, `payload-${version}`);
  mkdirSync(staging);
  mkdirSync(payload);
  writeFileSync(path.join(payload, "server.js"), `// ${version}\n`);
  if (unitId === "assistant") {
    const sidecarEntry = path.join(payload, ASSISTANT_RUNTIME_DESCRIPTOR.sidecars[0].entry);
    mkdirSync(path.dirname(sidecarEntry), { recursive: true });
    writeFileSync(sidecarEntry, "// test Assistant sidecar\n");
    writeFileSync(
      path.join(payload, ".assistant-runtime.json"),
      `${JSON.stringify(ASSISTANT_RUNTIME_DESCRIPTOR, null, 2)}\n`,
    );
  }
  const artifactFile = path.join(staging, "artifact.tgz");
  const tar = spawnSync("tar", ["-C", payload, "-czf", artifactFile, "."], { encoding: "utf8" });
  assert.equal(tar.status, 0, tar.stderr);
  const graphFile = path.join(staging, "deploy-graph.json");
  const contractFile = path.join(staging, "deploy-unit-contract.json");
  const requirementsFile = path.join(staging, "control-plane-requirements.json");
  writePrivateJson(graphFile, files.graph);
  writePrivateJson(contractFile, contract(files.graph, unitId));
  writePrivateJson(requirementsFile, {
    schemaVersion: 1,
    kind: "workspace-control-plane-requirements",
    source: { commitSha: sourceCharacter.repeat(40), treeSha: sourceCharacter.toUpperCase().toLowerCase().repeat(40) },
    inputs: {
      migrationSetSha256: files.control.receipt.inputs.migrationSetSha256,
      resourceManifestSha256: files.control.receipt.inputs.resourceManifestSha256,
      dataReleaseManifestSetSha256: files.control.receipt.inputs.dataReleaseManifestSetSha256,
      lifecycleToolSetSha256: files.control.receipt.inputs.lifecycleToolSetSha256,
    },
    createdAt: "2026-07-25T00:10:00.000Z",
  });
  const manifest = createDeployUnitArtifactManifest({
    contractFile,
    artifactFile,
    controlPlaneRequirementsFile: requirementsFile,
    sourceSha: sourceCharacter.repeat(40),
    sourceTree: sourceCharacter.toUpperCase().toLowerCase().repeat(40),
    buildId: version,
    deploymentId: version,
    serverEntry: "server.js",
    createdAt: "2026-07-25T00:20:00.000Z",
  });
  writePrivateJson(path.join(staging, "artifact.manifest.json"), manifest);
  return staging;
}

function fixture(activeUnitId = "finance") {
  const root = mkdtempSync(path.join(os.tmpdir(), "workspace-apply-deploy-unit-"));
  const remoteDir = path.join(root, "remote");
  const fakeBin = path.join(root, "bin");
  const runtimeRoot = path.join(root, "runtime");
  const nginxSite = path.join(root, "workspace.conf");
  const preparedStateRoot = path.join(remoteDir, ".workspace", "gateway", "profile-preparations", "test-rollout");
  mkdirSync(path.join(remoteDir, ".workspace", ".deployment"), { recursive: true });
  mkdirSync(fakeBin);
  mkdirSync(runtimeRoot);
  const control = tenantAndControlPlane(path.join(root, "control"));
  cpSync(control.controlPlaneReceiptFile, path.join(remoteDir, ".workspace", "control-plane-release.json"));
  cpSync(control.tenantManifestFile, path.join(remoteDir, ".workspace", ".deployment", "tenant-config-manifest.json"));
  writeFileSync(nginxSite, "server {\n    location /workspace {\n        proxy_pass http://127.0.0.1:3000;\n    }\n}\n");
  executable(path.join(fakeBin, "sudo"), "#!/bin/sh\nexec \"$@\"\n");
  executable(path.join(fakeBin, "nginx"), "#!/bin/sh\n[ \"$1\" = '-t' ]\n");
  executable(path.join(fakeBin, "systemctl"), "#!/bin/sh\nexit 0\n");
  executable(path.join(fakeBin, "flock"), "#!/bin/sh\nexit 0\n");
  executable(path.join(fakeBin, "pm2"), `#!/bin/sh
case "$1" in
  start)
    printf '%s' "$BUILD_VERSION" > "$FAKE_RUNTIME_ROOT/$PORT"
    shift
    while [ "$#" -gt 0 ]; do
      if [ "$1" = "--name" ]; then shift; process_name="$1"; break; fi
      shift
    done
    if [ -n "\${process_name:-}" ]; then
      : > "$FAKE_RUNTIME_ROOT/process-$process_name"
      printf '%s' "\${WORKSPACE_DEPLOY_UNIT_ID:-}" > "$FAKE_RUNTIME_ROOT/identity-unit-$process_name"
      printf '%s' "\${WORKSPACE_INTERNAL_SIGNING_PRIVATE_KEY_FILE:-}" > "$FAKE_RUNTIME_ROOT/identity-private-$process_name"
      printf '%s' "\${WORKSPACE_INTERNAL_TRUSTED_PUBLIC_KEYS_FILE:-}" > "$FAKE_RUNTIME_ROOT/identity-registry-$process_name"
      printf '%s' "\${WORKSPACE_INTERNAL_ORIGIN:-}" > "$FAKE_RUNTIME_ROOT/internal-origin-$process_name"
    fi
    ;;
  delete)
    rm -f "$FAKE_RUNTIME_ROOT/process-$2"
    ;;
  jlist)
    node - "$FAKE_RUNTIME_ROOT" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const root = process.argv[2];
const processes = fs.readdirSync(root)
  .filter((name) => name.startsWith("process-"))
  .map((name) => ({ name: name.slice("process-".length), pm2_env: { status: "online" } }));
process.stdout.write(JSON.stringify(processes));
NODE
    ;;
esac
exit 0
`);
  executable(path.join(fakeBin, "curl"), `#!/bin/sh
url=""
for argument do url="$argument"; done
port="$(printf '%s' "$url" | sed -E 's#^http://127\\.0\\.0\\.1:([0-9]+).*#\\1#')"
[ -f "$FAKE_RUNTIME_ROOT/$port" ] || exit 22
case "$url" in
  */api/settings/version) printf '{"version":"%s"}\n' "$(cat "$FAKE_RUNTIME_ROOT/$port")" ;;
  *) printf '{"ok":true}\n' ;;
esac
`);
  return { root, remoteDir, fakeBin, runtimeRoot, nginxSite, preparedStateRoot, graph: graph(activeUnitId), control };
}

function apply(files, args) {
  return spawnSync("bash", [applyScript, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${files.fakeBin}:${process.env.PATH}`,
      REMOTE_DIR: files.remoteDir,
      FAKE_RUNTIME_ROOT: files.runtimeRoot,
      WORKSPACE_GATEWAY_NGINX_SITE: files.nginxSite,
      DEPLOY_PROFILE_PREPARED_STATE_ROOT: files.preparedStateRoot,
      WECHAT_BOT_ID: "test-bot",
      WECHAT_BOT_SECRET: "test-secret",
      DEPLOY_EVENT_FILE: path.join(files.root, "deploy-event.json"),
      DEPLOY_PACKAGE_VERSION: "0.1.2",
    },
  });
}

test("prepare starts the inactive slot and writes a proposed state without switching Gateway", () => {
  const files = fixture();
  const staging = buildStaging(files, "finance-profile-v1", "5");
  const prepared = apply(files, ["deploy", "finance", staging, "prepare"]);
  assert.equal(prepared.status, 0, `${prepared.stderr}\n${prepared.stdout}`);
  assert.match(prepared.stdout, /profile-prepared/);
  const state = readDeployUnitState(path.join(files.preparedStateRoot, "finance.json"));
  assert.equal(state.active.slot, "blue");
  assert.equal(state.active.deploymentId, "finance-profile-v1");
  assert.equal(spawnSync("test", ["-e", path.join(files.remoteDir, ".workspace", "gateway", "current")]).status, 1);
  assert.equal(readFileSync(path.join(files.runtimeRoot, "process-workspace-finance-blue"), "utf8"), "");
  const identityRoot = path.join(files.remoteDir, ".workspace", "internal-unit-identities");
  const privateKeyFile = path.join(identityRoot, "private", "finance.pem");
  const registryFile = path.join(identityRoot, "trusted-public-keys.json");
  assert.match(readFileSync(privateKeyFile, "utf8"), /BEGIN PRIVATE KEY/);
  const registry = JSON.parse(readFileSync(registryFile, "utf8"));
  assert.equal(registry.kind, "workspace-internal-trusted-public-keys");
  assert.match(registry.keys.finance, /BEGIN PUBLIC KEY/);
  assert.equal(readFileSync(path.join(files.runtimeRoot, "identity-unit-workspace-finance-blue"), "utf8"), "finance");
  assert.equal(readFileSync(path.join(files.runtimeRoot, "identity-private-workspace-finance-blue"), "utf8"), privateKeyFile);
  assert.equal(readFileSync(path.join(files.runtimeRoot, "identity-registry-workspace-finance-blue"), "utf8"), registryFile);
  assert.equal(spawnSync("test", ["-e", path.join(files.remoteDir, ".workspace", ".env")]).status, 1);
});

test("deploy units default signed internal RPC to the managed public Gateway origin", () => {
  const files = fixture();
  writeFileSync(
    path.join(files.remoteDir, ".workspace", ".env"),
    "WORKSPACE_PUBLIC_ORIGIN=https://workspace.example.test\n",
  );
  const staging = buildStaging(files, "finance-gateway-origin-v1", "7");
  const prepared = apply(files, ["deploy", "finance", staging, "prepare"]);
  assert.equal(prepared.status, 0, `${prepared.stderr}\n${prepared.stdout}`);
  assert.equal(
    readFileSync(path.join(files.runtimeRoot, "internal-origin-workspace-finance-blue"), "utf8"),
    "https://workspace.example.test",
  );
});

test("prepare fails closed while a deploy unit is still only a candidate", () => {
  const files = fixture("assistant");
  const staging = buildStaging(files, "finance-candidate-v1", "6");
  const prepared = apply(files, ["deploy", "finance", staging, "prepare"]);
  assert.notEqual(prepared.status, 0);
  assert.match(prepared.stderr, /not active in the deploy graph/);
  assert.equal(spawnSync("test", ["-e", path.join(files.preparedStateRoot, "finance.json")]).status, 1);
  assert.equal(
    spawnSync("test", ["-e", path.join(files.remoteDir, ".workspace", "internal-unit-identities")]).status,
    1,
  );
});

test("two active deploys alternate slots and rollback selects the exact previous release", () => {
  const files = fixture();
  const blue = buildStaging(files, "finance-v1", "1");
  const first = apply(files, ["deploy", "finance", blue, "activate"]);
  assert.equal(first.status, 0, `${first.stderr}\n${first.stdout}`);
  const privateKeyFile = path.join(files.remoteDir, ".workspace", "internal-unit-identities", "private", "finance.pem");
  const originalPrivateKey = readFileSync(privateKeyFile, "utf8");
  let stateFile = path.join(files.remoteDir, ".workspace", "gateway", "current", "unit-states", "finance.json");
  assert.equal(readDeployUnitState(stateFile).active.slot, "blue");
  assert.deepEqual(JSON.parse(readFileSync(path.join(files.root, "deploy-event.json"), "utf8")).modules, [
    { unitId: "finance", moduleKeys: ["finance"], moduleLabels: ["财务管理"] },
  ]);

  const green = buildStaging(files, "finance-v2", "2");
  const second = apply(files, ["deploy", "finance", green, "activate"]);
  assert.equal(second.status, 0, `${second.stderr}\n${second.stdout}`);
  assert.equal(readFileSync(privateKeyFile, "utf8"), originalPrivateKey);
  let state = readDeployUnitState(stateFile);
  assert.equal(state.active.slot, "green");
  assert.equal(state.active.deploymentId, "finance-v2");
  assert.equal(state.previous.deploymentId, "finance-v1");

  const rolledBack = apply(files, ["rollback", "finance"]);
  assert.equal(rolledBack.status, 0, `${rolledBack.stderr}\n${rolledBack.stdout}`);
  stateFile = path.join(files.remoteDir, ".workspace", "gateway", "current", "unit-states", "finance.json");
  state = readDeployUnitState(stateFile);
  assert.equal(state.active.slot, "blue");
  assert.equal(state.active.deploymentId, "finance-v1");
  assert.equal(state.previous.deploymentId, "finance-v2");
  assert.match(readFileSync(files.nginxSite, "utf8"), /workspace-deploy-gateway/);
  assert.equal(JSON.parse(readFileSync(path.join(files.root, "deploy-event.json"), "utf8")).action, "rollback");
});

test("Assistant sidecar stays off in shadow and follows the active slot across activate and rollback", () => {
  const files = fixture("assistant");
  const firstStaging = buildStaging(files, "assistant-v1", "3", "assistant");
  const shadow = apply(files, ["deploy", "assistant", firstStaging, "shadow"]);
  assert.equal(shadow.status, 0, `${shadow.stderr}\n${shadow.stdout}`);
  assert.equal(readFileSync(path.join(files.runtimeRoot, "3208"), "utf8"), "assistant-v1");
  assert.equal(spawnSync("test", ["-e", path.join(files.runtimeRoot, "process-workspace-assistant-wecom-blue")]).status, 1);

  const firstActive = apply(files, ["deploy", "assistant", firstStaging, "activate"]);
  assert.equal(firstActive.status, 0, `${firstActive.stderr}\n${firstActive.stdout}`);
  assert.equal(readFileSync(path.join(files.runtimeRoot, "process-workspace-assistant-wecom-blue"), "utf8"), "");

  const secondStaging = buildStaging(files, "assistant-v2", "4", "assistant");
  const secondActive = apply(files, ["deploy", "assistant", secondStaging, "activate"]);
  assert.equal(secondActive.status, 0, `${secondActive.stderr}\n${secondActive.stdout}`);
  assert.equal(readFileSync(path.join(files.runtimeRoot, "process-workspace-assistant-wecom-green"), "utf8"), "");
  assert.equal(spawnSync("test", ["-e", path.join(files.runtimeRoot, "process-workspace-assistant-wecom-blue")]).status, 1);

  const rolledBack = apply(files, ["rollback", "assistant"]);
  assert.equal(rolledBack.status, 0, `${rolledBack.stderr}\n${rolledBack.stdout}`);
  assert.equal(readFileSync(path.join(files.runtimeRoot, "process-workspace-assistant-wecom-blue"), "utf8"), "");
  assert.equal(spawnSync("test", ["-e", path.join(files.runtimeRoot, "process-workspace-assistant-wecom-green")]).status, 1);
});
