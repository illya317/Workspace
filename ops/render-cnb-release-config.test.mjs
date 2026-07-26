import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { renderCnbReleaseConfig } from "./render-cnb-release-config.mjs";
import { validateCnbReleaseConfig } from "./validate-cnb-release-config.mjs";

const canonical = readFileSync(new URL("./cnb-release.yml", import.meta.url), "utf8");

test("renders one exact shadow unit into the otherwise canonical CNB pipeline", () => {
  const rendered = renderCnbReleaseConfig(canonical, { deployUnitId: "finance" });
  const pipeline = validateCnbReleaseConfig(rendered, { deployUnitId: "finance", deployUnitMode: "shadow" });
  assert.equal(pipeline.env.DEPLOY_UNIT_ID, "finance");
  assert.equal(pipeline.env.DEPLOY_UNIT_MODE, "shadow");
});

test("renders one exact active unit and rejects malformed unit injection", () => {
  const active = renderCnbReleaseConfig(canonical, { deployUnitId: "external", deployUnitMode: "activate" });
  const pipeline = validateCnbReleaseConfig(active, { deployUnitId: "external", deployUnitMode: "activate" });
  assert.equal(pipeline.env.DEPLOY_UNIT_ID, "external");
  assert.equal(pipeline.env.DEPLOY_UNIT_MODE, "activate");
  assert.throws(() => renderCnbReleaseConfig(canonical, { deployUnitId: "Finance" }), /unit id/i);
  assert.throws(
    () => renderCnbReleaseConfig(canonical, { deployUnitId: "finance", deployUnitMode: "rollback" }),
    /shadow or activate/i,
  );
});
