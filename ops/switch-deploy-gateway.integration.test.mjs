import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { createGatewayGeneration } from "./gateway-generation.mjs";
import { writePrivateJson } from "./deploy-unit-release.mjs";

const switchScript = path.resolve("ops/switch-deploy-gateway.sh");

function graph() {
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
        runtime: { slots: { blue: { port: 3200 }, green: { port: 3300 } }, assetPrefix: null },
      },
      {
        id: "finance",
        kind: "business-l1",
        maturity: "active",
        pageRoutes: ["/finance"],
        apiPrefixes: ["/api/modules/finance"],
        runtime: {
          slots: { blue: { port: 3201 }, green: { port: 3301 } },
          assetPrefix: "/workspace-static/finance",
        },
      },
    ],
  };
}

function activation(slot) {
  return {
    schemaVersion: 1,
    kind: "workspace-deploy-unit-activation",
    unitId: "finance",
    slot,
    port: slot === "blue" ? 3201 : 3301,
    releaseId: `finance-${slot}`,
    releaseDir: `/srv/workspace/deploy-units/finance/releases/finance-${slot}`,
    deploymentId: `finance-${slot}`,
    artifact: { sha256: "a".repeat(64), manifestSha256: "b".repeat(64) },
    receiptSha256: slot === "blue" ? "c".repeat(64) : "d".repeat(64),
    activatedAt: "2026-07-25T00:00:00.000Z",
  };
}

function state(slot, previous = null) {
  return {
    schemaVersion: 1,
    kind: "workspace-deploy-unit-state",
    unitId: "finance",
    active: activation(slot),
    previous,
    updatedAt: "2026-07-25T00:00:00.000Z",
  };
}

function executable(file, body) {
  writeFileSync(file, body);
  chmodSync(file, 0o755);
}

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "workspace-gateway-switch-"));
  const graphFile = path.join(root, "deploy-graph.json");
  const stateRoot = path.join(root, "states");
  const buildRoot = path.join(root, "build");
  const gatewayRoot = path.join(root, "live-gateway");
  const nginxSite = path.join(root, "workspace.conf");
  const fakeBin = path.join(root, "bin");
  mkdirSync(stateRoot);
  mkdirSync(fakeBin);
  writePrivateJson(graphFile, graph());
  writePrivateJson(path.join(stateRoot, "finance.json"), state("blue"));
  writeFileSync(nginxSite, `server {\n    location /workspace {\n        proxy_pass http://127.0.0.1:3000;\n    }\n}\n`);
  executable(path.join(fakeBin, "sudo"), "#!/bin/sh\nexec \"$@\"\n");
  executable(path.join(fakeBin, "nginx"), "#!/bin/sh\n[ \"$1\" = '-t' ]\n");
  executable(path.join(fakeBin, "systemctl"), "#!/bin/sh\n[ \"${FAIL_GATEWAY_RELOAD:-0}\" != '1' ]\n");
  return { root, graphFile, stateRoot, buildRoot, gatewayRoot, nginxSite, fakeBin };
}

function generation(files, slot, generatedAt) {
  const override = path.join(files.root, `${slot}-state.json`);
  writePrivateJson(override, state(slot, slot === "green" ? activation("blue") : null));
  const manifest = createGatewayGeneration({
    graphFile: files.graphFile,
    stateRoot: files.stateRoot,
    stateOverrides: { finance: override },
    outputRoot: files.buildRoot,
    generatedAt,
  });
  return path.join(files.buildRoot, "generations", manifest.generationId);
}

function runSwitch(files, generationDirectory, extraEnv = {}) {
  return spawnSync("bash", [switchScript, "--generation", generationDirectory], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${files.fakeBin}:${process.env.PATH}`,
      WORKSPACE_GATEWAY_ROOT: files.gatewayRoot,
      WORKSPACE_GATEWAY_NGINX_SITE: files.nginxSite,
      ...extraEnv,
    },
  });
}

test("switch bootstraps the Nginx include and atomically selects an immutable generation", () => {
  const files = fixture();
  const blue = generation(files, "blue", "2026-07-25T01:00:00.000Z");
  const result = runSwitch(files, blue);
  assert.equal(result.status, 0, result.stderr);
  const site = readFileSync(files.nginxSite, "utf8");
  assert.match(site, /# BEGIN workspace-deploy-gateway/);
  assert.match(site, new RegExp(`include ${files.gatewayRoot.replaceAll("/", "\\/")}\/current\/workspace-gateway\\.conf;`));
  assert.doesNotMatch(site, /proxy_pass http:\/\/127\.0\.0\.1:3000/);
  assert.equal(path.basename(readlinkSync(path.join(files.gatewayRoot, "current"))), path.basename(blue));

  const idempotent = runSwitch(files, blue);
  assert.equal(idempotent.status, 0, idempotent.stderr);
});

test("failed Nginx reload restores the previous Gateway generation", () => {
  const files = fixture();
  const blue = generation(files, "blue", "2026-07-25T01:00:00.000Z");
  assert.equal(runSwitch(files, blue).status, 0);
  const oldGenerationId = path.basename(readlinkSync(path.join(files.gatewayRoot, "current")));
  const green = generation(files, "green", "2026-07-25T02:00:00.000Z");
  const failed = runSwitch(files, green, { FAIL_GATEWAY_RELOAD: "1" });
  assert.notEqual(failed.status, 0);
  assert.equal(path.basename(readlinkSync(path.join(files.gatewayRoot, "current"))), oldGenerationId);
});
