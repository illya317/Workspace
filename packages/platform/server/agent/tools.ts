/**
 * Agent tool contracts.
 * Platform owns orchestration; domain packages own concrete tool adapters.
 */
import type { SessionUser } from "@workspace/platform/types";

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
