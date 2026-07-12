/**
 * DeepSeek LLM 接入（Anthropic Messages API 兼容）。
 */
import { serializeAgentModelContext } from "../model-context";
import type { AgentModelProvider, HistoryMessage, IntentResult, SummarizeInput } from "./provider";

const BASE = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/anthropic";
const API_KEY = process.env.DEEPSEEK_API_KEY || "";
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const MAX_TOKENS = 1024;

async function chat(
  systemPrompt: string,
  userMessage: string,
  history?: HistoryMessage[],
  signal?: AbortSignal,
): Promise<string> {
  if (!API_KEY) throw new Error("DEEPSEEK_API_KEY not configured");

  const messages: Array<{ role: string; content: string }> = [];

  if (history && history.length > 0) {
    for (const h of history) {
      messages.push({
        role: h.role === "agent" ? "assistant" : "user",
        content: h.content,
      });
    }
  }
  messages.push({ role: "user", content: userMessage });

  const res = await fetch(`${BASE}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages,
    }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DeepSeek API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const textBlock = data?.content?.find((b: { type: string }) => b.type === "text");
  return textBlock?.text || "";
}

export const deepseekProvider: AgentModelProvider = {
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
};
