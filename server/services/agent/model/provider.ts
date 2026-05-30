/**
 * Agent LLM 供应商接口。
 * 不绑定具体供应商，方便后续切换。
 */

export interface IntentResult {
  tool: string | null;       // 匹配到的工具 key，null = 无法匹配
  confidence: number;        // 0-1
  params: Record<string, unknown>;
  clarification?: string;    // 需要用户澄清时的问题
}

export interface SummarizeInput {
  toolLabel: string;
  query: string;
  result: unknown;
}

export interface AgentModelProvider {
  /** 将用户自然语言分类为工具调用 */
  classifyIntent(
    userMessage: string,
    capabilities: Array<{ key: string; label: string; description: string }>
  ): Promise<IntentResult>;

  /** 将工具返回的原始数据总结为对话语言 */
  summarizeResult(input: SummarizeInput): Promise<string>;
}
