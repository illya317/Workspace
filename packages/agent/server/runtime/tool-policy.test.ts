import assert from "node:assert/strict";
import test from "node:test";

import type { AgentTool, AgentToolResult } from "../tools";
import {
  assertAgentToolResultPolicy,
  runtimeToolDescription,
} from "./tool-policy";

function tool(writeMode?: AgentTool["writeMode"]): AgentTool {
  return {
    key: "docs.updateQcTemplate",
    label: "Update QC template",
    description: "Update a QC template",
    requiredPermissions: [],
    mutates: true,
    ...(writeMode ? { writeMode } : {}),
    execute: async () => ({ type: "data", message: "done" }),
  };
}

test("mutating tools remain proposal-only unless direct mode is explicit", () => {
  const result: AgentToolResult = { type: "data", message: "done" };
  assert.throws(() => assertAgentToolResultPolicy(tool(), result), /未返回 proposal/);
  assert.doesNotThrow(() => assertAgentToolResultPolicy(tool("direct"), result));
  assert.match(runtimeToolDescription(tool("direct")), /DIRECT_WRITE/);
});

test("direct-write tools cannot disguise a proposal as a completed write", () => {
  const result: AgentToolResult = {
    type: "proposal",
    message: "pending",
    proposal: { id: 1, actionKey: "x", targetType: "Template", diff: {} },
  };
  assert.throws(() => assertAgentToolResultPolicy(tool("direct"), result), /不得返回 proposal/);
});

test("runtime descriptions include provider-neutral valid call examples", () => {
  const source = tool();
  source.examples = [{
    user: "Create the template",
    arguments: { scopeType: "department", scopeId: 12 },
  }];

  const description = runtimeToolDescription(source);
  assert.match(description, /Valid call examples/);
  assert.match(description, /Create the template/);
  assert.match(description, /\"scopeType\":\"department\"/);
});
