import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
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
import { normalizeRuntimeTree } from "./release/artifact/runtime-tree-permissions.mjs";
const applyScript = path.resolve("ops/apply-deploy-unit.sh");
const sidecarScript = path.resolve("ops/deploy-unit-sidecar.sh");
const promoteProfileScript = path.resolve("ops/promote-deploy-profile.sh");
const rollbackProfileScript = path.resolve("ops/rollback-deploy-profile.sh");
const gatewayGenerationTool = path.resolve("ops/gateway-generation.mjs");
const switchGatewayScript = path.resolve("ops/switch-deploy-gateway.sh");

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
  const lifecycleRoot = path.join(root, "lifecycle");
  const tenantManifestFile = path.join(root, "tenant-config-manifest.json");
  for (const relativePath of [
    "node_modules/prisma/package.json",
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
    controlPlane: { authority: "workspace-control-plane-job", policy: "require-existing", minimumSchemaReceipt: "required-before-unit-start" },
    readiness: { contributorBlockers: [] },
  };
}

function buildStaging(files, version, sourceCharacter, unitId = "finance") {
  const staging = path.join(files.root, `staging-${version}`);
  const payload = path.join(files.root, `payload-${version}`);
  for (const directory of [staging, payload]) mkdirSync(directory);
  writeFileSync(path.join(payload, "server.js"), `// ${version}\n`);
  writeFileSync(path.join(payload, ".server-entry"), "server.js\n");
  mkdirSync(path.join(payload, ".next"));
  writeFileSync(path.join(payload, ".next/BUILD_ID"), `${version}\n`);
  writePrivateJson(path.join(payload, ".next/routes-manifest.json"), { basePath: "/workspace" });
  if (unitId === "assistant") {
    const sidecarEntry = path.join(payload, ASSISTANT_RUNTIME_DESCRIPTOR.sidecars[0].entry);
    mkdirSync(path.dirname(sidecarEntry), { recursive: true });
    writeFileSync(sidecarEntry, "// test Assistant sidecar\n");
    writeFileSync(path.join(payload, ".assistant-runtime.json"), `${JSON.stringify(ASSISTANT_RUNTIME_DESCRIPTOR, null, 2)}\n`);
  }
  const [graphFile, contractFile, requirementsFile] = ["deploy-graph.json", "deploy-unit-contract.json", "control-plane-requirements.json"].map((file) => path.join(staging, file));
  writePrivateJson(graphFile, files.graph);
  writePrivateJson(contractFile, contract(files.graph, unitId));
  writePrivateJson(requirementsFile, {
    schemaVersion: 1,
    kind: "workspace-control-plane-requirements",
    source: { commitSha: sourceCharacter.repeat(40), treeSha: sourceCharacter.toUpperCase().toLowerCase().repeat(40) },
    inputs: {
      migrationSetSha256: files.control.receipt.inputs.migrationSetSha256,
      resourceManifestSha256: files.control.receipt.inputs.resourceManifestSha256,
      lifecycleToolSetSha256: files.control.receipt.inputs.lifecycleToolSetSha256,
    },
    createdAt: "2026-07-25T00:10:00.000Z",
  });
  cpSync(contractFile, path.join(payload, ".deploy-unit-contract.json"));
  cpSync(requirementsFile, path.join(payload, ".control-plane-requirements.json"));
  const artifactFile = path.join(staging, "artifact.tgz");
  normalizeRuntimeTree(payload);
  const tar = spawnSync("tar", ["-C", payload, "-czf", artifactFile, "."], { encoding: "utf8" });
  assert.equal(tar.status, 0, tar.stderr);
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
    if [ -n "\${FAIL_PM2_PROCESS_NAME:-}" ] && [ "\${process_name:-}" = "$FAIL_PM2_PROCESS_NAME" ]; then
      exit 1
    fi
    if [ -n "\${process_name:-}" ]; then
      rm -f "$FAKE_RUNTIME_ROOT/stopped-$process_name"
      : > "$FAKE_RUNTIME_ROOT/process-$process_name"
      printf '%s' "\${WORKSPACE_DEPLOY_UNIT_ID:-}" > "$FAKE_RUNTIME_ROOT/identity-unit-$process_name"
      printf '%s' "\${WORKSPACE_DEPLOY_SLOT:-}" > "$FAKE_RUNTIME_ROOT/deploy-slot-$process_name"
      printf '%s' "\${WORKSPACE_DEPLOY_CURRENT_STATE_FILE:-}" > "$FAKE_RUNTIME_ROOT/current-state-$process_name"
      printf '%s' "\${WORKSPACE_INTERNAL_SIGNING_PRIVATE_KEY_FILE:-}" > "$FAKE_RUNTIME_ROOT/identity-private-$process_name"
      printf '%s' "\${WORKSPACE_INTERNAL_TRUSTED_PUBLIC_KEYS_FILE:-}" > "$FAKE_RUNTIME_ROOT/identity-registry-$process_name"
      printf '%s' "\${WORKSPACE_INTERNAL_ORIGIN:-}" > "$FAKE_RUNTIME_ROOT/internal-origin-$process_name"
    fi
    ;;
  delete)
    rm -f "$FAKE_RUNTIME_ROOT/process-$2" "$FAKE_RUNTIME_ROOT/stopped-$2"
    ;;
  stop)
    if [ -f "$FAKE_RUNTIME_ROOT/process-$2" ]; then
      mv "$FAKE_RUNTIME_ROOT/process-$2" "$FAKE_RUNTIME_ROOT/stopped-$2"
    fi
    ;;
  restart)
    if [ -f "$FAKE_RUNTIME_ROOT/stopped-$2" ]; then
      mv "$FAKE_RUNTIME_ROOT/stopped-$2" "$FAKE_RUNTIME_ROOT/process-$2"
    elif [ ! -f "$FAKE_RUNTIME_ROOT/process-$2" ]; then
      exit 1
    fi
    ;;
  jlist)
    node - "$FAKE_RUNTIME_ROOT" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const root = process.argv[2];
const processes = fs.readdirSync(root).flatMap((name) => {
  if (name.startsWith("process-")) {
    return [{ name: name.slice("process-".length), pid: 4100, pm2_env: { status: "online" } }];
  }
  if (name.startsWith("stopped-")) {
    return [{ name: name.slice("stopped-".length), pid: 0, pm2_env: { status: "stopped" } }];
  }
  return [];
});
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

function commandEnvironment(files, extraEnvironment = {}) {
  return {
    ...process.env,
    PATH: `${files.fakeBin}:${process.env.PATH}`,
    REMOTE_DIR: files.remoteDir,
    FAKE_RUNTIME_ROOT: files.runtimeRoot,
    WORKSPACE_GATEWAY_NGINX_SITE: files.nginxSite,
    DEPLOY_PROFILE_PREPARED_STATE_ROOT: files.preparedStateRoot,
    WECHAT_BOT_ID: "test-bot",
    WECHAT_BOT_SECRET: "test-secret",
    WECOM_WORKER_BRIDGE_SECRET: "test-worker-bridge-secret-at-least-32-characters",
    WORKSPACE_PUBLIC_ORIGIN: "https://workspace.example.test",
    DEPLOY_EVENT_FILE: path.join(files.root, "deploy-event.json"),
    DEPLOY_PACKAGE_VERSION: "0.1.2",
    ...extraEnvironment,
  };
}

function apply(files, args, extraEnvironment = {}) {
  return spawnSync("bash", [applyScript, ...args], {
    encoding: "utf8",
    env: commandEnvironment(files, extraEnvironment),
  });
}

function createProfileInputs(files) {
  const state = readDeployUnitState(path.join(files.preparedStateRoot, "assistant.json"));
  const graphSha256 = sha256(canonicalJson(files.graph));
  const profileBody = {
    schemaVersion: 1,
    kind: "workspace-deployment-profile",
    id: "assistant-profile",
    label: "Assistant",
    version: 1,
    graphSha256,
    unitIds: ["assistant"],
    units: [{ id: "assistant", moduleKeys: ["assistant"], moduleLabels: ["智能体"] }],
    rollout: { strategy: "shadow-all-then-atomic-gateway", requireSignedProvenance: true },
  };
  const profile = { ...profileBody, profileSha256: sha256(canonicalJson(profileBody)) };
  const manifest = JSON.parse(readFileSync(path.join(state.active.releaseDir, "artifact.manifest.json"), "utf8"));
  const releaseBody = {
    schemaVersion: 1,
    kind: "workspace-deployment-profile-release",
    profile: { id: profile.id, version: profile.version, sha256: profile.profileSha256 },
    graphSha256,
    sourceSetSha256: "a".repeat(64),
    controlPlaneRequirementsSha256: manifest.controlPlane.requirementsSha256,
    rollout: profile.rollout,
    units: [{
      unitId: "assistant",
      source: manifest.source,
      controlPlaneRequirementsSha256: manifest.controlPlane.requirementsSha256,
      artifact: state.active.artifact,
    }],
    createdAt: "2026-07-25T01:00:00.000Z",
  };
  const release = { ...releaseBody, releaseSetSha256: sha256(canonicalJson(releaseBody)) };
  const rolloutBody = {
    schemaVersion: 1,
    kind: "workspace-deployment-profile-rollout",
    profile: { id: profile.id, version: profile.version, sha256: profile.profileSha256 },
    releaseSetSha256: release.releaseSetSha256,
    targetUnitIds: ["assistant"],
  };
  const rollout = { ...rolloutBody, rolloutSha256: sha256(canonicalJson(rolloutBody)) };
  const observation = {
    status: "passed",
    releaseSetSha256: release.releaseSetSha256,
    resultSha256: "b".repeat(64),
  };
  const paths = Object.fromEntries([
    ["profile", profile],
    ["release", release],
    ["rollout", rollout],
    ["observation", observation],
  ].map(([name, value]) => {
    const file = path.join(files.root, `${name}.json`);
    writePrivateJson(file, value);
    return [name, file];
  }));
  const graphFile = path.join(files.root, "profile-deploy-graph.json");
  writePrivateJson(graphFile, files.graph);
  return { ...paths, graph: graphFile };
}

function promoteProfile(files, inputs, extraEnvironment = {}) {
  return spawnSync("bash", [promoteProfileScript,
    inputs.profile, inputs.release, inputs.rollout, inputs.observation,
    inputs.graph, files.preparedStateRoot,
  ], { encoding: "utf8", env: commandEnvironment(files, extraEnvironment) });
}

function rollbackProfile(files, receipt) {
  return spawnSync("bash", [rollbackProfileScript, receipt], {
    encoding: "utf8",
    env: commandEnvironment(files),
  });
}

function captureAssistantOwner(gatewayRoot) {
  return spawnSync("bash", [
    "-c",
    'source "$1"; workspace_capture_gateway_assistant_owner "$2"',
    "capture-assistant-owner",
    sidecarScript,
    gatewayRoot,
  ], { encoding: "utf8" });
}

function activateFallbackGateway(files) {
  const graphFile = path.join(files.root, "fallback-deploy-graph.json");
  writePrivateJson(graphFile, files.graph);
  const gatewayRoot = path.join(files.remoteDir, ".workspace", "gateway");
  const created = spawnSync(process.execPath, [
    gatewayGenerationTool, "create-fallback",
    "--graph", graphFile,
    "--output-root", gatewayRoot,
    "--generated-at", "2026-07-25T00:30:00.000Z",
  ], { encoding: "utf8" });
  assert.equal(created.status, 0, created.stderr);
  const generation = path.join(gatewayRoot, "generations", created.stdout.trim());
  const switched = spawnSync("bash", [switchGatewayScript, "--generation", generation], {
    encoding: "utf8",
    env: commandEnvironment(files, { WORKSPACE_GATEWAY_ROOT: gatewayRoot }),
  });
  assert.equal(switched.status, 0, `${switched.stderr}\n${switched.stdout}`);
}

function runningAssistantSidecars(files) {
  return readdirSync(files.runtimeRoot)
    .filter((name) => name.startsWith("process-workspace-assistant-wecom-"))
    .sort();
}

function seedMonolithWecomSidecar(files) {
  writeFileSync(path.join(files.runtimeRoot, "process-workspace-wecom-agent"), "");
}

function monolithWecomState(files) {
  if (readdirSync(files.runtimeRoot).includes("process-workspace-wecom-agent")) return "online";
  if (readdirSync(files.runtimeRoot).includes("stopped-workspace-wecom-agent")) return "inactive";
  return "missing";
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
  assert.equal(readFileSync(path.join(files.runtimeRoot, "deploy-slot-workspace-finance-blue"), "utf8"), "blue");
  assert.equal(
    readFileSync(path.join(files.runtimeRoot, "current-state-workspace-finance-blue"), "utf8"),
    path.join(files.remoteDir, ".workspace", "gateway", "current", "unit-states", "finance.json"),
  );
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

test("Assistant sidecar stays off in shadow and prepare, then follows the committed active slot", () => {
  const files = fixture("assistant");
  seedMonolithWecomSidecar(files);
  const firstStaging = buildStaging(files, "assistant-v1", "3", "assistant");
  const shadow = apply(files, ["deploy", "assistant", firstStaging, "shadow"]);
  assert.equal(shadow.status, 0, `${shadow.stderr}\n${shadow.stdout}`);
  assert.equal(readFileSync(path.join(files.runtimeRoot, "3208"), "utf8"), "assistant-v1");
  assert.deepEqual(runningAssistantSidecars(files), []);
  assert.equal(monolithWecomState(files), "online");

  const prepared = apply(files, ["deploy", "assistant", firstStaging, "prepare"]);
  assert.equal(prepared.status, 0);
  assert.deepEqual(runningAssistantSidecars(files), []);
  assert.equal(monolithWecomState(files), "online");

  const firstActive = apply(files, ["deploy", "assistant", firstStaging, "activate"]);
  assert.equal(firstActive.status, 0, `${firstActive.stderr}\n${firstActive.stdout}`);
  assert.deepEqual(runningAssistantSidecars(files), ["process-workspace-assistant-wecom-blue"]);
  assert.equal(monolithWecomState(files), "inactive");

  const secondStaging = buildStaging(files, "assistant-v2", "4", "assistant");
  const secondActive = apply(files, ["deploy", "assistant", secondStaging, "activate"]);
  assert.equal(secondActive.status, 0, `${secondActive.stderr}\n${secondActive.stdout}`);
  assert.deepEqual(runningAssistantSidecars(files), ["process-workspace-assistant-wecom-green"]);
  assert.equal(monolithWecomState(files), "inactive");

  const rolledBack = apply(files, ["rollback", "assistant"]);
  assert.equal(rolledBack.status, 0, `${rolledBack.stderr}\n${rolledBack.stdout}`);
  assert.deepEqual(runningAssistantSidecars(files), ["process-workspace-assistant-wecom-blue"]);
  assert.equal(monolithWecomState(files), "inactive");
});

test("first Assistant activation restores the monolith Bot when the unit sidecar cannot start", () => {
  const files = fixture("assistant");
  seedMonolithWecomSidecar(files);
  const staging = buildStaging(files, "assistant-failed-v1", "a", "assistant");
  const failed = apply(files, ["deploy", "assistant", staging, "activate"], {
    FAIL_PM2_PROCESS_NAME: "workspace-assistant-wecom-blue",
  });
  assert.notEqual(failed.status, 0);
  assert.deepEqual(runningAssistantSidecars(files), []);
  assert.equal(monolithWecomState(files), "online");
  assert.equal(
    spawnSync("test", ["-e", path.join(
      files.remoteDir, ".workspace", "gateway", "current", "unit-states", "assistant.json",
    )]).status,
    1,
  );
});

test("Assistant owner capture rejects a missing committed marker only when Assistant state exists", () => {
  const fallbackFiles = fixture("assistant");
  seedMonolithWecomSidecar(fallbackFiles);
  activateFallbackGateway(fallbackFiles);
  const fallbackGatewayRoot = path.join(fallbackFiles.remoteDir, ".workspace", "gateway");
  rmSync(path.join(fallbackGatewayRoot, "committed-generation"));
  const markerlessFallback = captureAssistantOwner(fallbackGatewayRoot);
  assert.equal(markerlessFallback.status, 1, markerlessFallback.stderr);
  const firstStaging = buildStaging(fallbackFiles, "assistant-markerless-fallback", "c", "assistant");
  const firstActive = apply(fallbackFiles, ["deploy", "assistant", firstStaging, "activate"]);
  assert.equal(firstActive.status, 0, `${firstActive.stderr}\n${firstActive.stdout}`);
  assert.deepEqual(runningAssistantSidecars(fallbackFiles), [
    "process-workspace-assistant-wecom-blue",
  ]);

  const activeFiles = fixture("assistant");
  seedMonolithWecomSidecar(activeFiles);
  const activeStaging = buildStaging(activeFiles, "assistant-marker-v1", "d", "assistant");
  const active = apply(activeFiles, ["deploy", "assistant", activeStaging, "activate"]);
  assert.equal(active.status, 0, `${active.stderr}\n${active.stdout}`);
  const activeGatewayRoot = path.join(activeFiles.remoteDir, ".workspace", "gateway");
  rmSync(path.join(activeGatewayRoot, "committed-generation"));
  const rejected = captureAssistantOwner(activeGatewayRoot);
  assert.equal(rejected.status, 2);
  assert.match(rejected.stderr, /Assistant state 存在但 committed generation marker 缺失/);
  assert.deepEqual(runningAssistantSidecars(activeFiles), [
    "process-workspace-assistant-wecom-blue",
  ]);
});

test("Assistant profile promotion and rollback transfer exactly one sidecar and restore it on start failure", () => {
  const files = fixture("assistant");
  const firstStaging = buildStaging(files, "assistant-profile-v1", "8", "assistant");
  const firstActive = apply(files, ["deploy", "assistant", firstStaging, "activate"]);
  assert.equal(firstActive.status, 0, `${firstActive.stderr}\n${firstActive.stdout}`);
  assert.deepEqual(runningAssistantSidecars(files), ["process-workspace-assistant-wecom-blue"]);

  const secondStaging = buildStaging(files, "assistant-profile-v2", "9", "assistant");
  const prepared = apply(files, ["deploy", "assistant", secondStaging, "prepare"]);
  assert.equal(prepared.status, 0, `${prepared.stderr}\n${prepared.stdout}`);
  assert.deepEqual(runningAssistantSidecars(files), ["process-workspace-assistant-wecom-blue"]);
  const inputs = createProfileInputs(files);

  const failed = promoteProfile(files, inputs, {
    FAIL_PM2_PROCESS_NAME: "workspace-assistant-wecom-green",
  });
  assert.notEqual(failed.status, 0);
  const currentStateFile = path.join(
    files.remoteDir, ".workspace", "gateway", "current", "unit-states", "assistant.json",
  );
  assert.equal(readDeployUnitState(currentStateFile).active.deploymentId, "assistant-profile-v1");
  assert.deepEqual(runningAssistantSidecars(files), ["process-workspace-assistant-wecom-blue"]);
  const gatewayRoot = path.join(files.remoteDir, ".workspace", "gateway");
  assert.equal(
    readFileSync(path.join(gatewayRoot, "committed-generation"), "utf8").trim(),
    path.basename(realpathSync(path.join(gatewayRoot, "current"))),
  );

  const promoted = promoteProfile(files, inputs);
  assert.equal(promoted.status, 0, `${promoted.stderr}\n${promoted.stdout}`);
  assert.equal(readDeployUnitState(currentStateFile).active.deploymentId, "assistant-profile-v2");
  assert.deepEqual(runningAssistantSidecars(files), ["process-workspace-assistant-wecom-green"]);
  const receiptMatch = promoted.stdout.match(/promotion receipt: (.+)$/m);
  assert.ok(receiptMatch);

  const rolledBack = rollbackProfile(files, receiptMatch[1].trim());
  assert.equal(rolledBack.status, 0, `${rolledBack.stderr}\n${rolledBack.stdout}`);
  assert.equal(readDeployUnitState(currentStateFile).active.deploymentId, "assistant-profile-v1");
  assert.deepEqual(runningAssistantSidecars(files), ["process-workspace-assistant-wecom-blue"]);
});

test("Assistant profile rollback to a fallback generation returns Bot ownership to monolith", () => {
  const files = fixture("assistant");
  seedMonolithWecomSidecar(files);
  activateFallbackGateway(files);
  const staging = buildStaging(files, "assistant-profile-first-v1", "b", "assistant");
  const prepared = apply(files, ["deploy", "assistant", staging, "prepare"]);
  assert.equal(prepared.status, 0, `${prepared.stderr}\n${prepared.stdout}`);
  assert.equal(monolithWecomState(files), "online");
  assert.deepEqual(runningAssistantSidecars(files), []);

  const inputs = createProfileInputs(files);
  const promoted = promoteProfile(files, inputs);
  assert.equal(promoted.status, 0, `${promoted.stderr}\n${promoted.stdout}`);
  assert.equal(monolithWecomState(files), "inactive");
  assert.deepEqual(runningAssistantSidecars(files), ["process-workspace-assistant-wecom-blue"]);
  const receiptMatch = promoted.stdout.match(/promotion receipt: (.+)$/m);
  assert.ok(receiptMatch);

  const rolledBack = rollbackProfile(files, receiptMatch[1].trim());
  assert.equal(rolledBack.status, 0, `${rolledBack.stderr}\n${rolledBack.stdout}`);
  assert.equal(monolithWecomState(files), "online");
  assert.deepEqual(runningAssistantSidecars(files), []);
  assert.equal(
    spawnSync("test", ["-e", path.join(
      files.remoteDir, ".workspace", "gateway", "current", "unit-states", "assistant.json",
    )]).status,
    1,
  );
});
