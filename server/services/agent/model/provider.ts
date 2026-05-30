/**
 * Agent LLM 供应商接口。
 * 不绑定具体供应商，方便后续切换。
 */

export interface HistoryMessage {
  role: "user" | "agent";
  content: string;
}

export interface IntentResult {
  tool: string | null;
  confidence: number;
  params: Record<string, unknown>;
  clarification?: string;
  /** 如果上下文已包含答案，直接返回，无需调用工具 */
  directAnswer?: string;
}

export interface SummarizeInput {
  toolLabel: string;
  query: string;
  result: unknown;
  history?: HistoryMessage[];
}

export interface AgentModelProvider {
  /** 将用户自然语言分类为工具调用，支持多轮对话历史 */
  classifyIntent(
    userMessage: string,
    capabilities: Array<{ key: string; label: string; description: string }>,
    history?: HistoryMessage[],
  ): Promise<IntentResult>;

  /** 将工具返回的原始数据总结为对话语言 */
  summarizeResult(input: SummarizeInput): Promise<string>;
}
