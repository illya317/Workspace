import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { renderCnbReleaseConfig } from "./render-cnb-release-config.mjs";
import { validateCnbReleaseConfig } from "./validate-cnb-release-config.mjs";

const canonical = readFileSync(new URL("./cnb-release.yml", import.meta.url), "utf8");
const validationBaseSha = "a".repeat(40);

test("renders one exact shadow unit into the otherwise canonical CNB pipeline", () => {
  const rendered = renderCnbReleaseConfig(canonical, { deployUnitId: "finance", validationBaseSha });
  const pipeline = validateCnbReleaseConfig(rendered, {
    deployUnitId: "finance", deployUnitMode: "shadow", releaseAction: "deploy", validationBaseSha,
  });
  assert.equal(pipeline.env.DEPLOY_UNIT_ID, "finance");
  assert.equal(pipeline.env.DEPLOY_UNIT_MODE, "shadow");
});

test("renders one exact active unit and rejects malformed unit injection", () => {
  const active = renderCnbReleaseConfig(canonical, {
    deployUnitId: "external", deployUnitMode: "activate", validationBaseSha,
  });
  const pipeline = validateCnbReleaseConfig(active, {
    deployUnitId: "external", deployUnitMode: "activate", releaseAction: "deploy", validationBaseSha,
  });
  assert.equal(pipeline.env.DEPLOY_UNIT_ID, "external");
  assert.equal(pipeline.env.DEPLOY_UNIT_MODE, "activate");
  assert.throws(() => renderCnbReleaseConfig(canonical, { deployUnitId: "Finance", validationBaseSha }), /unit id/i);
  assert.throws(
    () => renderCnbReleaseConfig(canonical, { deployUnitId: "finance", deployUnitMode: "rollback", validationBaseSha }),
    /shadow or activate/i,
  );
});

test("validate rendering skips server prerequisites but keeps the governed deploy adapter", () => {
  const rendered = renderCnbReleaseConfig(canonical, {
    releaseAction: "validate",
    validationBaseSha,
  });
  const pipeline = validateCnbReleaseConfig(rendered, { releaseAction: "validate", validationBaseSha });
  assert.equal(pipeline.env.RELEASE_ACTION, "validate");
  assert.equal(pipeline.env.RELEASE_VALIDATION_BASE_SHA, validationBaseSha);
  assert.deepEqual(Object.keys(pipeline.stages.at(-1)).sort(), ["name", "script"]);
});
