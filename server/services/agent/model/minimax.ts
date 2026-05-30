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
  async classifyIntent(userMessage, capabilities, history) {
    const toolList = capabilities
      .map((c) => `- ${c.key}: ${c.label} — ${c.description}`)
      .join("\n");

    const systemPrompt = `你是内部管理系统的小助手。根据对话上下文和当前用户输入，选择合适的工具。
可用工具：
${toolList}

返回严格 JSON（不要 markdown 代码块）：
{
  "tool": "工具key" | null,
  "confidence": 0.0-1.0,
  "params": {},
  "clarification": null,
  "directAnswer": null
}

规则：
- 如果对话历史已包含答案（如用户追问"她电话多少"而上一条结果中已有电话），设置 tool=null, confidence=1, directAnswer="从历史中提取的答案"
- 利用对话历史理解代词引用（如"她"指上一个搜索结果中的人）
- 需要查询新数据时，选择合适的工具并提取参数
- 无法确定意图时 tool=null，confidence<0.5，填写 clarification
- 只返回 JSON，不输出其他内容`;

    const text = await chat(systemPrompt, userMessage, history);
    try {
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
- 如果结果为空，如实说明
- 考虑对话历史，回答要衔接之前的对话`;

    const userMessage = `用户查询：${input.query}（工具：${input.toolLabel}）
查询结果：${JSON.stringify(input.result)}`;

    return chat(systemPrompt, userMessage, input.history);
  },
};
