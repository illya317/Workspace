/**
 * Agent 编排器。
 * 接收用户输入 → 意图分类 → 选择工具 → 权限二次校验 → 执行 → 总结 → 返回结果。
 */
import type { SessionUser } from "@/lib/types";
import { buildCapabilities, findTool } from "./capabilities";
import { minimaxProvider } from "./model/minimax";
import type { AgentModelProvider } from "./model/provider";

export interface AgentResponse {
  type: "answer" | "error" | "clarification";
  message: string;
  toolUsed?: string;
  data?: unknown;
}

export async function processMessage(
  userMessage: string,
  user: SessionUser,
  provider: AgentModelProvider = minimaxProvider,
): Promise<AgentResponse> {
  const capabilities = buildCapabilities(user);

  if (capabilities.length === 0) {
    return {
      type: "answer",
      message: "你当前没有可用功能。如需帮助，请联系管理员开通相应权限。",
    };
  }

  // 1. 意图分类
  const intent = await provider.classifyIntent(
    userMessage,
    capabilities.map((c) => ({ key: c.key, label: c.label, description: c.description })),
  );

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

  // 4. 用 LLM 总结为对话语言
  let summary: string;
  try {
    summary = await provider.summarizeResult({
      toolLabel: tool.label,
      query: userMessage,
      result: result,
    });
  } catch {
    summary = result.message;
  }

  return {
    type: "answer",
    message: summary,
    toolUsed: tool.key,
    data: result.data,
  };
}
