/**
 * Agent 工具注册表。
 * 所有工具在此声明权限绑定，Agent 不能绕过权限直接调用。
 */
import type { SessionUser } from "@/lib/types";

export interface AgentToolResult {
  type: "data" | "error" | "empty";
  data?: unknown;
  message: string;
}

export interface AgentTool {
  key: string;
  label: string;
  description: string;
  /** 返回 true 表示该用户可使用此工具 */
  canUse: (user: SessionUser) => boolean;
  /** 执行工具，返回结构化结果 */
  execute: (params: Record<string, unknown>, user: SessionUser) => Promise<AgentToolResult>;
}

// 工具在此集中注册
import { searchEmployeesTool } from "./hr";
import { queryBudgetTool } from "./finance";

export const TOOLS: AgentTool[] = [
  searchEmployeesTool,
  queryBudgetTool,
];
