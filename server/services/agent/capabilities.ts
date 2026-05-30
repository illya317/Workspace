/**
 * 根据 SessionUser 权限生成可用能力清单。
 * Agent 只能使用当前用户有权限的工具。
 */
import type { SessionUser } from "@/lib/types";
import type { AgentTool } from "./tools/registry";
import { TOOLS } from "./tools/registry";

export interface Capability {
  key: string;
  label: string;
  description: string;
  /** 说明：该能力来自哪个工具 */
  source: "tool";
}

export function buildCapabilities(user: SessionUser): Capability[] {
  return TOOLS
    .filter((tool) => tool.canUse(user))
    .map((tool) => ({
      key: tool.key,
      label: tool.label,
      description: tool.description,
      source: "tool" as const,
    }));
}

/** 按 key 查找工具，同时校验权限 */
export function findTool(key: string, user: SessionUser): AgentTool | null {
  const tool = TOOLS.find((t) => t.key === key);
  if (!tool) return null;
  if (!tool.canUse(user)) return null;
  return tool;
}
