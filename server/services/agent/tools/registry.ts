/**
 * Agent 工具注册表。
 * 所有工具在此声明权限绑定，Agent 不能绕过权限直接调用。
 */
import type { SessionUser } from "@/lib/types";

export interface AgentToolResult {
  type: "data" | "error" | "empty" | "proposal";
  data?: unknown;
  message: string;
  /** proposal 类型特有：待确认变更的详情 */
  proposal?: {
    id: number;
    actionKey: string;
    targetType: string;
    targetId?: string;
    diff: Record<string, unknown>;
  };
}

export interface AgentTool {
  key: string;
  label: string;
  description: string;
  /** true = 涉及写入，只能返回 proposal */
  mutates: boolean;
  canUse: (user: SessionUser) => boolean;
  execute: (params: Record<string, unknown>, user: SessionUser) => Promise<AgentToolResult>;
}

// 工具在此集中注册
import { searchEmployeesTool, updateEmployeeDraftTool, batchUpdateEmployeeDraftTool } from "./hr";
import { queryBudgetTool } from "./finance";

export const TOOLS: AgentTool[] = [
  searchEmployeesTool,
  updateEmployeeDraftTool,
  batchUpdateEmployeeDraftTool,
  queryBudgetTool,
];
