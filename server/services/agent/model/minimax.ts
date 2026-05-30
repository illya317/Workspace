/**
 * MiniMax LLM 接入（Anthropic Messages API 兼容）。
 */
import type { AgentModelProvider, HistoryMessage, IntentResult, SummarizeInput } from "./provider";

const BASE = process.env.MINIMAX_BASE_URL || "https://api.minimaxi.com/anthropic";
const API_KEY = process.env.MINIMAX_API_KEY || "";
const MODEL = process.env.MINIMAX_MODEL || "MiniMax-M2.7";
const MAX_TOKENS = 1024;
const MAX_HISTORY = 10; // 滑动窗口大小

async function chat(
  systemPrompt: string,
  userMessage: string,
  history?: HistoryMessage[],
): Promise<string> {
  if (!API_KEY) throw new Error("MINIMAX_API_KEY not configured");

  // 构建消息数组：历史 + 当前用户输入
  const messages: Array<{ role: string; content: string }> = [];

  if (history && history.length > 0) {
    const recent = history.slice(-MAX_HISTORY);
    for (const h of recent) {
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
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MiniMax API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const textBlock = data?.content?.find((b: { type: string }) => b.type === "text");
  return textBlock?.text || "";
}

export const minimaxProvider: AgentModelProvider = {
  async classifyIntent(userMessage, systemPrompt, history) {
    const text = await chat(systemPrompt, userMessage, history);
    try {
      const json = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      return JSON.parse(json) as IntentResult;
    } catch {
      return { tool: null, confidence: 0, params: {}, clarification: "抱歉，我没理解你的意思，能换个说法吗？" };
    }
  },

  async summarizeResult(input: SummarizeInput, systemPrompt: string) {
    const userMessage = `用户查询：${input.query}（工具：${input.toolLabel}）
查询结果：${JSON.stringify(input.result)}`;
    return chat(systemPrompt, userMessage, input.history);
  },
};
