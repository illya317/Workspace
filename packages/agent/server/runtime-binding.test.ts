import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVE_WORKSPACE_RUNTIME_WHERE,
  AGENT_RUNTIME_KINDS,
  WORKSPACE_AGENT_CAPABILITY_KEYS,
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
    parseAgentCapabilityKeys('["workspace.api.read","workspace.api.read"]'),
    ["workspace.api.read"],
  );
  assert.deepEqual(WORKSPACE_AGENT_CAPABILITY_KEYS, [
    "workspace.api.discover",
    "workspace.api.read",
    "workspace.api.proposeMutation",
  ]);
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
