import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const promote = readFileSync("ops/promote-deploy-profile.sh", "utf8");
const rollback = readFileSync("ops/rollback-deploy-profile.sh", "utf8");

test("profile promotion requires SLO evidence and switches one generated Gateway set", () => {
  assert.match(promote, /--observation-result/);
  assert.match(promote, /gateway-generation\.mjs/);
  assert.match(promote, /switch-deploy-gateway\.sh/);
  assert.match(promote, /exec 9>"\$LOCK_FILE"/);
  assert.match(promote, /deploy-notification\.mjs" profile-write/);
  assert.ok(promote.indexOf('switch-deploy-gateway.sh') < promote.indexOf('deploy-notification.mjs" profile-write'));
});

test("profile rollback consumes a digest-bound promotion receipt and rejects stale generations", () => {
  assert.match(rollback, /receipt-assert/);
  assert.match(rollback, /previousGenerationId/);
  assert.match(rollback, /exec 9>"\$LOCK_FILE"/);
  assert.match(rollback, /CURRENT_GENERATION_ID/);
  assert.match(rollback, /PROMOTED_GENERATION_ID/);
  assert.match(rollback, /switch-deploy-gateway\.sh/);
});
