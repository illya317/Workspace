import assert from "node:assert/strict";
import test from "node:test";

import {
  validateAgentConfigurationUpdate,
  type AgentConfigurationValidationContext,
} from "./configuration-validation";

function context(
  runtimeKind: AgentConfigurationValidationContext["runtime"] extends infer T
    ? T extends { runtimeKind: infer K }
      ? K
      : never
    : never = "workspace",
): AgentConfigurationValidationContext {
  return {
    profileId: 7,
    runtime: { id: 11, agentProfileId: 7, runtimeKind },
    availableWorkspaceCapabilityKeys: ["source.search", "hr.employee.read"],
  };
}

test("Agent profile configuration normalizes editable copy without accepting identity fields", () => {
  const result = validateAgentConfigurationUpdate({
    editorUserId: 3,
    profileId: 7,
    profile: {
      displayName: "  研发架构 Agent  ",
      roleName: "  研发架构  ",
      responsibilities: "  只负责代码审查与 PR。  ",
      status: "active",
    },
  }, context());

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data.profile, {
    displayName: "研发架构 Agent",
    roleName: "研发架构",
    responsibilities: "只负责代码审查与 PR。",
    status: "active",
  });
  assert.equal("actorUserId" in result.data, false);
  assert.equal("key" in result.data, false);
});

test("Workspace capability allowlist only accepts registered actor-usable tools", () => {
  const accepted = validateAgentConfigurationUpdate({
    editorUserId: 3,
    profileId: 7,
    runtime: {
      id: 11,
      status: "active",
      interactive: true,
      instructions: "  Work only inside the configured boundary.  ",
      capabilityKeys: [" source.search ", "source.search", "hr.employee.read"],
    },
  }, context());

  assert.equal(accepted.ok, true);
  if (accepted.ok) {
    assert.deepEqual(accepted.data.runtime?.capabilityKeys, ["source.search", "hr.employee.read"]);
    assert.equal(accepted.data.runtime?.runtimeKind, "workspace");
    assert.equal(accepted.data.runtime?.instructions, "Work only inside the configured boundary.");
  }

  const rejected = validateAgentConfigurationUpdate({
    editorUserId: 3,
    profileId: 7,
    runtime: {
      id: 11,
      status: "active",
      interactive: true,
      instructions: "Use a made-up tool.",
      capabilityKeys: ["source.unregistered"],
    },
  }, context());
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.issue.field, "runtime.capabilityKeys");
    assert.match(rejected.issue.message, /未注册或虚拟员工无权使用/);
  }
});

test("external runtime keys use strict syntax and are deduplicated", () => {
  const accepted = validateAgentConfigurationUpdate({
    editorUserId: 3,
    profileId: 7,
    runtime: {
      id: 11,
      status: "suspended",
      interactive: false,
      instructions: "Create a pull request receipt.",
      capabilityKeys: ["code.review", "code.review", "cicd:deploy-prod"],
    },
  }, context("codex_local"));
  assert.equal(accepted.ok, true);
  if (accepted.ok) {
    assert.deepEqual(accepted.data.runtime?.capabilityKeys, ["code.review", "cicd:deploy-prod"]);
  }

  const rejected = validateAgentConfigurationUpdate({
    editorUserId: 3,
    profileId: 7,
    runtime: {
      id: 11,
      status: "active",
      interactive: false,
      instructions: "Invalid key.",
      capabilityKeys: ["Can Deploy Anything"],
    },
  }, context("server_ops"));
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.match(rejected.issue.message, /格式无效/);
});

test("runtime identity must stay attached to the requested profile", () => {
  const result = validateAgentConfigurationUpdate({
    editorUserId: 3,
    profileId: 7,
    runtime: {
      id: 11,
      status: "active",
      interactive: true,
      instructions: "Do not move bindings.",
      capabilityKeys: [],
    },
  }, {
    ...context(),
    runtime: { id: 11, agentProfileId: 8, runtimeKind: "workspace" },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.issue.status, 409);
    assert.equal(result.issue.field, "runtime.id");
  }
});
