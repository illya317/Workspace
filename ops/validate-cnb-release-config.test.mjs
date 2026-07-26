import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateCnbReleaseConfig } from "./validate-cnb-release-config.mjs";

const canonical = readFileSync(new URL("./cnb-release.yml", import.meta.url), "utf8");
const tenantFixture = readFileSync(
  new URL("../scripts/check/fixtures/tenant-workspace/config/tenant/cnb-release.yml", import.meta.url),
  "utf8",
);

test("canonical CNB release config uses the pinned Builder and safe caches", () => {
  const pipeline = validateCnbReleaseConfig(canonical);
  assert.equal(pipeline.name, "deploy-prod");
  assert.equal(Object.hasOwn(pipeline, "imports"), false);
  assert.equal(pipeline.stages.at(-1).imports.length, 1);
});

test("checked-in tenant fixture satisfies the same governed release contract", () => {
  assert.equal(validateCnbReleaseConfig(tenantFixture).name, "deploy-prod");
});

test("CNB release config rejects cold setup and missing cache inputs", () => {
  const cold = canonical
    .replace(/        build:[\s\S]*?        volumes:/, "        image: node:24-bookworm\n        volumes:")
    .replace("          - workspace-release-next-v1:./.next/cache:copy-on-write\n", "")
    .replace("        - name: verify-builder", "        - name: install-deploy-tools");
  assert.throws(() => validateCnbReleaseConfig(cold), /deploy-prod\.docker|governed release list|verify-builder/);
});

test("CNB release config allows only the governed verified artifact cache, never node_modules or a direct tgz mount", () => {
  const nodeModules = canonical.replace(
    "          - workspace-release-tsbuild-v1:./.cache/tsbuild:copy-on-write",
    "          - workspace-release-tsbuild-v1:./.cache/tsbuild:copy-on-write\n          - workspace-release-node-v1:./node_modules:copy-on-write",
  );
  const artifact = canonical.replace(
    "          - workspace-release-tsbuild-v1:./.cache/tsbuild:copy-on-write",
    "          - workspace-release-tsbuild-v1:./.cache/tsbuild:copy-on-write\n          - workspace-release-artifact-v1:./.next/workspace-standalone.tgz:copy-on-write",
  );
  assert.throws(() => validateCnbReleaseConfig(nodeModules), /governed release list exactly/);
  assert.throws(() => validateCnbReleaseConfig(artifact), /governed release list exactly/);
});

test("CNB release config rejects extra pipelines, stages, and pipeline-scoped imports", () => {
  const extraPipeline = canonical.replace(
    "    - name: deploy-prod",
    "    - name: shadow-prod\n      docker: {}\n      stages: []\n    - name: deploy-prod",
  );
  const extraStage = canonical.replace(
    "        - name: deploy-to-server",
    "        - name: ungoverned\n          script: echo unsafe\n        - name: deploy-to-server",
  );
  const pipelineImport = canonical.replace(
    "      env:\n        RUN_LOCAL_CHECKS:",
    "      imports:\n        - https://cnb.cool/owner/env/-/blob/main/server-prod.yaml\n      env:\n        RUN_LOCAL_CHECKS:",
  );
  assert.throws(() => validateCnbReleaseConfig(extraPipeline), /only one deploy-prod pipeline/);
  assert.throws(() => validateCnbReleaseConfig(extraStage), /exactly the governed release stages/);
  assert.throws(() => validateCnbReleaseConfig(pipelineImport), /must contain exactly/);
});

test("CNB release config rejects comment-spoofed or reordered release commands", () => {
  const commentSpoof = canonical.replace(
    "            bash ./ops/run-cnb-release-stage.sh server.deploy -- bash ./ops/deploy-cnb-release-target.sh",
    "            # bash ./ops/run-cnb-release-stage.sh server.deploy -- bash ./ops/deploy-cnb-release-target.sh\n            bash ./ops/other-deploy.sh",
  );
  const reordered = canonical
    .replace("        - name: verify-builder", "        - name: temporary-stage")
    .replace("        - name: install-dependencies", "        - name: verify-builder")
    .replace("        - name: temporary-stage", "        - name: install-dependencies");
  assert.throws(() => validateCnbReleaseConfig(commentSpoof), /governed release command exactly/);
  assert.throws(() => validateCnbReleaseConfig(reordered), /stage order/);
});
