/**
 * Kimi coding model provider (OpenAI-compatible chat completions API).
 */
import { serializeAgentModelContext } from "../model-context";
import type {
  AgentMessageContentPart,
  AgentModelProvider,
  AgentToolCall,
  HistoryMessage,
  IntentResult,
  SummarizeInput,
  ToolCallInput,
  ToolCallResult,
} from "./provider";

const BASE = process.env.KIMI_BASE_URL || "https://api.kimi.com/coding/v1";
const API_KEY = process.env.KIMI_API_KEY || process.env.KIMI_API_KEY_OC || "";
const MODEL = process.env.KIMI_MODEL || "kimi-for-coding";
const DEFAULT_MAX_TOKENS = 32_768;
const MAX_OUTPUT_TOKENS = 32_768;

export function parseKimiMaxTokens(value: string | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return DEFAULT_MAX_TOKENS;
  return Math.min(parsed, MAX_OUTPUT_TOKENS);
}

const MAX_TOKENS = parseKimiMaxTokens(process.env.KIMI_MAX_TOKENS);

type KimiMessage = {
  role: "system" | "user" | "assistant";
  content: string | AgentMessageContentPart[];
};

function endpoint(path: string) {
  return `${BASE.replace(/\/+$/, "")}${path}`;
}

function withKimiModelConfig(body: Record<string, unknown>) {
  return {
    ...body,
    model: MODEL,
    max_tokens: MAX_TOKENS,
  };
}

export function buildKimiMessages(systemPrompt: string, userMessage: string, history?: HistoryMessage[]) {
  const messages: KimiMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  if (history && history.length > 0) {
    for (const h of history) {
      messages.push({
        role: h.role === "agent" ? "assistant" : "user",
        content: h.content,
      });
    }
  }

  messages.push({ role: "user", content: userMessage });
  return messages;
}

async function postChat(body: Record<string, unknown>, signal?: AbortSignal) {
  if (!API_KEY) throw new Error("KIMI_API_KEY not configured");

  const res = await fetch(endpoint("/chat/completions"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kimi API error ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

async function chat(
  systemPrompt: string,
  userMessage: string,
  history?: HistoryMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const data = await postChat(withKimiModelConfig({
    messages: buildKimiMessages(systemPrompt, userMessage, history),
  }), signal);
  const content = data?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseToolArguments(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseToolCalls(rawToolCalls: unknown): AgentToolCall[] {
  if (!Array.isArray(rawToolCalls)) return [];
  return rawToolCalls.flatMap((call, index) => {
    if (!isRecord(call)) return [];
    const fn = call.function;
    if (!isRecord(fn) || typeof fn.name !== "string" || !fn.name) return [];
    const id = typeof call.id === "string" && call.id ? call.id : `call_${index}`;
    return [{
      id,
      name: fn.name,
      arguments: parseToolArguments(fn.arguments),
    }];
  });
}

export const kimiProvider: AgentModelProvider = {
  async classifyIntent(userMessage, systemPrompt, history, signal) {
    const text = await chat(systemPrompt, userMessage, history, signal);
    try {
      const json = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      return JSON.parse(json) as IntentResult;
    } catch {
      return { tool: null, confidence: 0, params: {}, clarification: "抱歉，我没理解你的意思，能换个说法吗？" };
    }
  },

  async summarizeResult(input: SummarizeInput, systemPrompt: string, signal) {
    const userMessage = `用户查询：${input.query}（工具：${input.toolLabel}）
查询结果：${serializeAgentModelContext(input.result)}`;
    return chat(systemPrompt, userMessage, input.history, signal);
  },

  async callWithTools(input: ToolCallInput): Promise<ToolCallResult> {
    const data = await postChat(withKimiModelConfig({
      messages: input.messages,
      tools: input.tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters ?? {
            type: "object",
            properties: {},
            additionalProperties: true,
          },
        },
      })),
      tool_choice: "auto",
    }), input.signal);

    const choice = data?.choices?.[0];
    const message = choice?.message;
    const content = typeof message?.content === "string" ? message.content : "";
    return {
      content,
      toolCalls: parseToolCalls(message?.tool_calls),
      rawFinishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason : undefined,
    };
  },
};
