import type { AgentConfigurationRuntimeItem } from "@workspace/platform/types";

export function workspaceCapabilityOptions(
  runtime: AgentConfigurationRuntimeItem,
  draftCapabilityKeys: readonly string[],
) {
  const options = [...runtime.availableCapabilities];
  const availableKeys = new Set(options.map((capability) => capability.key));
  for (const key of draftCapabilityKeys) {
    if (availableKeys.has(key)) continue;
    options.push({
      key,
      label: `${key}（当前不可用）`,
      description: "当前动作上限或虚拟员工组织权限不允许该能力；取消选择后才能保存有效配置。",
    });
  }
  return options;
}
