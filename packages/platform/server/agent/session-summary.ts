import { defaultAgentModelProvider } from "./model/default";

export const AGENT_SESSION_SUMMARY_CHARS = 6_000;
const SUMMARY_INPUT_CHARS = 24_000;

type SummaryMessage = { role: "user" | "agent"; content: string };

function truncateText(value: string | null | undefined, max: number) {
  const text = String(value ?? "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 12).trimEnd()}\n[truncated]`;
}

export async function summarizeAgentSessionHistory(previousSummary: string | null, messages: SummaryMessage[]) {
  const transcript = messages
    .map((message) => `${message.role === "user" ? "用户" : "助手"}：${message.content}`)
    .join("\n\n");
  const compactInput = truncateText([previousSummary ? `既有摘要：\n${previousSummary}` : "", transcript]
    .filter(Boolean)
    .join("\n\n"), SUMMARY_INPUT_CHARS);
  try {
    const summary = await defaultAgentModelProvider.summarizeResult({
      toolLabel: "AgentSessionCompaction",
      query: "压缩内部页面助手会话历史，保留对后续回答有用的信息。",
      result: { transcript: compactInput },
    }, `你在压缩内部管理系统页面助手的会话历史。
输出要求：
- 不超过 ${AGENT_SESSION_SUMMARY_CHARS} 个中文字符。
- 保留用户目标、已确认决策、当前页面/模块、关键源码路径、业务规则、未完成事项、proposal/PR 状态、拒答边界。
- 删除寒暄、重复内容和已过期工具结果。
- 不要编造没有出现过的事实。`);
    return truncateText(summary, AGENT_SESSION_SUMMARY_CHARS);
  } catch {
    const lines = messages.map((message) => {
      const prefix = message.role === "user" ? "用户" : "助手";
      return `- ${prefix}: ${truncateText(message.content.replace(/\s+/g, " "), 240)}`;
    });
    return truncateText([previousSummary, "近期压缩记录：", ...lines].filter(Boolean).join("\n"), AGENT_SESSION_SUMMARY_CHARS);
  }
}
