import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVE_WORKSPACE_RUNTIME_WHERE,
  AGENT_RUNTIME_KINDS,
  normalizeAgentRuntimeInstructions,
  parseAgentCapabilityKeys,
} from "./runtime-binding";

test("Workspace eligibility requires the active interactive Workspace binding", () => {
  assert.deepEqual(ACTIVE_WORKSPACE_RUNTIME_WHERE, {
    runtimeKind: AGENT_RUNTIME_KINDS.workspace,
    status: "active",
    interactive: true,
  });
});

test("runtime capabilities are normalized without accepting malformed values", () => {
  assert.deepEqual(
    parseAgentCapabilityKeys('["source.searchWorkspaceCode","source.searchWorkspaceCode"]'),
    ["source.searchWorkspaceCode"],
  );
  assert.throws(() => parseAgentCapabilityKeys('["",1]'));
  assert.throws(() => parseAgentCapabilityKeys("{}"));
});

test("runtime responsibility instructions are required and normalized", () => {
  assert.equal(
    normalizeAgentRuntimeInstructions("  Only work inside the Workspace boundary.  "),
    "Only work inside the Workspace boundary.",
  );
  assert.throws(() => normalizeAgentRuntimeInstructions("   "));
});
