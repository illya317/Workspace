import assert from "node:assert/strict";
import test from "node:test";

import type { AgentConfigurationRuntimeItem } from "@workspace/platform/types";
import { workspaceCapabilityOptions } from "./agent-configuration-refresh";

const search = { key: "source.searchWorkspaceCode", label: "搜索源码", description: "只读搜索" };
const submit = { key: "source.submitCnbPullRequest", label: "提交 PR", description: "创建 PR 提案" };

function runtime(submitAvailable: boolean): AgentConfigurationRuntimeItem {
  return {
    id: 40,
    kind: "workspace",
    status: "active",
    interactive: true,
    capabilityKeys: [search.key, submit.key],
    availableCapabilities: submitAvailable ? [search, submit] : [search],
    instructions: "处理研发任务",
    configurationValid: submitAvailable,
    receiptState: "workspace_audit",
  };
}

test("revoke and restore refreshes capability options without silently deleting the draft", () => {
  const draftCapabilityKeys = [search.key, submit.key];
  const blockedRuntime = runtime(false);
  const blockedOptions = workspaceCapabilityOptions(blockedRuntime, draftCapabilityKeys);

  assert.equal(blockedRuntime.configurationValid, false);
  assert.deepEqual(draftCapabilityKeys, [search.key, submit.key]);
  assert.deepEqual(blockedOptions.map((option) => option.key), draftCapabilityKeys);
  assert.match(blockedOptions[1]?.label ?? "", /当前不可用/);

  const restoredRuntime = runtime(true);
  const restoredOptions = workspaceCapabilityOptions(restoredRuntime, draftCapabilityKeys);
  assert.equal(restoredRuntime.configurationValid, true);
  assert.deepEqual(draftCapabilityKeys, [search.key, submit.key]);
  assert.deepEqual(restoredOptions, [search, submit]);
});
