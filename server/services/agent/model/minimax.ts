/**
 * MiniMax LLM 接入（Anthropic Messages API 兼容）。
 *
 * 环境变量：
 * - MINIMAX_API_KEY (required)
 * - MINIMAX_BASE_URL (默认 https://api.minimaxi.com/anthropic)
 * - MINIMAX_MODEL   (默认 MiniMax-M1)
 */

import type { AgentModelProvider, IntentResult, SummarizeInput } from "./provider";

const BASE = process.env.MINIMAX_BASE_URL || "https://api.minimaxi.com/anthropic";
const API_KEY = process.env.MINIMAX_API_KEY || "";
const MODEL = process.env.MINIMAX_MODEL || "MiniMax-M1";
const MAX_TOKENS = 1024;

async function chat(systemPrompt: string, userMessage: string): Promise<string> {
  if (!API_KEY) throw new Error("MINIMAX_API_KEY not configured");

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
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MiniMax API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  // Anthropic Messages 格式：content[0].text
  return data?.content?.[0]?.text || "";
}

export const minimaxProvider: AgentModelProvider = {
  async classifyIntent(userMessage, capabilities) {
    const toolList = capabilities
      .map((c) => `- ${c.key}: ${c.label} — ${c.description}`)
      .join("\n");

    const systemPrompt = `你是内部管理系统的小助手。根据用户输入，选择合适的工具。
可用工具：
${toolList}

返回严格 JSON（不要 markdown 代码块）：
{
  "tool": "工具key" | null,
  "confidence": 0.0-1.0,
  "params": {},
  "clarification": "需要澄清时填写，否则null"
}

规则：
- 无法匹配或模糊不清时 tool=null，confidence<0.5，填写 clarification
- 参数从用户输入中提取，字段名严格匹配工具定义
- 只返回 JSON，不输出其他内容`;

    const text = await chat(systemPrompt, userMessage);
    try {
      // 清理可能的 markdown 代码块包裹
      const json = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      return JSON.parse(json) as IntentResult;
    } catch {
      return { tool: null, confidence: 0, params: {}, clarification: "抱歉，我没理解你的意思，能换个说法吗？" };
    }
  },

  async summarizeResult(input: SummarizeInput) {
    const systemPrompt = `你是内部管理系统的小助手。把查询结果用简洁的中文总结出来。
要求：
- 1-3 句话概括关键信息
- 数字保留原始精度
- 不编造不存在的数据
- 如果结果为空，如实说明`;

    const userMessage = `用户查询：${input.query}（工具：${input.toolLabel}）
查询结果：${JSON.stringify(input.result)}`;

    return chat(systemPrompt, userMessage);
  },
};
