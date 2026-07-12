import assert from "node:assert/strict";
import test from "node:test";

import { PERMISSION_ACTION_KEYS } from "./permission-actions";
import {
  DEFAULT_AGENT_ALLOWED_PERMISSION_ACTIONS,
  agentPolicyAllowsActions,
  normalizeAgentAllowedPermissionActions,
} from "./agent-permission-policy";

test("default Agent ceiling allows useful work and denies high-risk actions", () => {
  assert.equal(agentPolicyAllowsActions(["read", "import"], DEFAULT_AGENT_ALLOWED_PERMISSION_ACTIONS), true);
  for (const action of [
    "delete", "archive", "revise", "reverse", "lock", "unlock",
    "approve", "reject", "share", "apiUse", "grant", "configure", "audit",
  ] as const) {
    assert.equal(agentPolicyAllowsActions([action], DEFAULT_AGENT_ALLOWED_PERMISSION_ACTIONS), false, action);
  }
});

test("stored Agent actions are normalized in registry order and unknown actions fail closed", () => {
  const normalized = normalizeAgentAllowedPermissionActions(["export", "futureAction", "read", "export"]);
  assert.deepEqual(normalized, PERMISSION_ACTION_KEYS.filter((action) => action === "read" || action === "export"));
  assert.deepEqual(normalizeAgentAllowedPermissionActions(null), [...DEFAULT_AGENT_ALLOWED_PERMISSION_ACTIONS]);
  assert.deepEqual(normalizeAgentAllowedPermissionActions([]), []);
});
