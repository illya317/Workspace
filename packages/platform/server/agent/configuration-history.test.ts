import assert from "node:assert/strict";
import test from "node:test";

import {
  getHistoryPolicy,
  labelHistoryField,
} from "../history-policy-registry";

test("Agent configuration entities have non-restorable edit-history policies", () => {
  const profile = getHistoryPolicy("AgentProfile");
  const runtime = getHistoryPolicy("AgentRuntimeBinding");
  const ceiling = getHistoryPolicy("AgentPermissionPolicy");

  assert.equal(profile?.modelKey, "agentProfile");
  assert.equal(profile?.baseline, "before-first-update");
  assert.equal(profile?.restore, false);
  assert.equal(labelHistoryField("AgentProfile", "responsibilities"), "职责说明");

  assert.equal(runtime?.modelKey, "agentRuntimeBinding");
  assert.equal(runtime?.baseline, "before-first-update");
  assert.equal(runtime?.restore, false);
  assert.equal(labelHistoryField("AgentRuntimeBinding", "capabilityKeysJson"), "运行时能力白名单");

  assert.equal(ceiling?.modelKey, "systemConfig");
  assert.equal(ceiling?.baseline, "before-first-update");
  assert.equal(ceiling?.restore, false);
  assert.equal(typeof ceiling?.readRecord, "function");
  assert.equal(labelHistoryField("AgentPermissionPolicy", "value"), "允许动作");
});
