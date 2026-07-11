/**
 * Agent LLM 供应商接口。
 * 不绑定具体供应商，方便后续切换。
 */

export interface HistoryMessage {
  role: "user" | "agent";
  content: string;
}

export type AgentMessageContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface AgentInputImage {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
  storageKey?: string;
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

export interface AgentModelToolDefinition {
  name: string;
  description: string;
  parameters?: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export interface AgentModelToolCallPayload {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export type AgentToolCallMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | AgentMessageContentPart[] }
  | { role: "assistant"; content?: string | null; tool_calls?: AgentModelToolCallPayload[] }
  | { role: "tool"; tool_call_id: string; name?: string; content: string };

export interface AgentToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallInput {
  messages: AgentToolCallMessage[];
  tools: AgentModelToolDefinition[];
  signal?: AbortSignal;
}

export interface ToolCallResult {
  content: string;
  toolCalls: AgentToolCall[];
  rawFinishReason?: string;
}

export interface AgentModelProvider {
  /** 将用户自然语言分类为工具调用，支持多轮对话历史 */
  classifyIntent(
    userMessage: string,
    systemPrompt: string,
    history?: HistoryMessage[],
    signal?: AbortSignal,
  ): Promise<IntentResult>;

  /** 将工具返回的原始数据总结为对话语言 */
  summarizeResult(input: SummarizeInput, systemPrompt: string, signal?: AbortSignal): Promise<string>;

  /** 原生 tool calling。支持的供应商优先走这个链路。 */
  callWithTools?(input: ToolCallInput): Promise<ToolCallResult>;
}
