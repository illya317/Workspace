/**
 * Agent 编排器。
 * 接收用户输入 → 意图分类 → 选择工具 → 权限二次校验 → 执行 → 总结 → 返回结果。
 */
import type { SessionUser } from "@/lib/types";
import { buildCapabilities, findTool } from "./capabilities";
import { minimaxProvider } from "./model/minimax";
import { noopProvider } from "./model/noop";
import type { AgentModelProvider, HistoryMessage, IntentResult } from "./model/provider";
import { buildClassifyPrompt, buildSummarizePrompt } from "./prompts";

export interface AgentResponse {
  type: "answer" | "error" | "clarification" | "proposal";
  message: string;
  toolUsed?: string;
  data?: unknown;
  proposal?: {
    id: number;
    actionKey: string;
    targetType: string;
    targetId?: string;
    diff: Record<string, unknown>;
  };
}

export async function processMessage(
  userMessage: string,
  user: SessionUser,
  history?: HistoryMessage[],
  provider: AgentModelProvider = minimaxProvider,
): Promise<AgentResponse> {
  const capabilities = buildCapabilities(user);

  if (capabilities.length === 0) {
    return {
      type: "answer",
      message: "你当前没有可用功能。如需帮助，请联系管理员开通相应权限。",
    };
  }

  const capList = capabilities.map((c) => ({ key: c.key, label: c.label, description: c.description }));
  const classifyPrompt = buildClassifyPrompt(capList);

  // 1. 意图分类（优先 LLM，失败回退规则匹配）
  let intent: IntentResult;
  try {
    intent = await provider.classifyIntent(userMessage, classifyPrompt, history);
  } catch {
    console.warn("[agent] LLM classifyIntent failed, falling back to noop provider");
    intent = await noopProvider.classifyIntent(userMessage, classifyPrompt, history);
  }

  // 上下文中已有答案，直接返回
  if (intent.directAnswer) {
    return { type: "answer", message: intent.directAnswer };
  }

  // 需要澄清
  if (!intent.tool || intent.confidence < 0.5) {
    return {
      type: "clarification",
      message: intent.clarification || "抱歉，我没理解你的意思，能换个说法吗？",
    };
  }

  // 2. 查找工具
  const tool = findTool(intent.tool, user);
  if (!tool) {
    return {
      type: "error",
      message: `工具 ${intent.tool} 不可用（权限不足或不存在）`,
    };
  }

  // 3. 执行工具（内部有二次权限校验）
  const result = await tool.execute(intent.params, user);

  // proposal 直接返回，不经过 LLM 总结
  if (result.type === "proposal" && result.proposal) {
    return {
      type: "proposal",
      message: result.message,
      toolUsed: tool.key,
      proposal: result.proposal,
    };
  }

  // 4. 用 LLM 总结为对话语言（失败则用规则总结）
  let summary: string;
  try {
    summary = await provider.summarizeResult({
      toolLabel: tool.label,
      query: userMessage,
      result: result,
      history,
    }, buildSummarizePrompt());
  } catch {
    summary = await noopProvider.summarizeResult({
      toolLabel: tool.label,
      query: userMessage,
      result: result,
    }, buildSummarizePrompt());
  }

  return {
    type: "answer",
    message: summary,
    toolUsed: tool.key,
    data: result.data,
  };
}
