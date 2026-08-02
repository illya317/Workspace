export const AGENT_SESSION_SUMMARY_CHARS = 6_000;

type SummaryMessage = { role: "user" | "agent"; content: string };

function truncateText(value: string | null | undefined, max: number) {
  const text = String(value ?? "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 12).trimEnd()}\n[truncated]`;
}

export async function summarizeAgentSessionHistory(previousSummary: string | null, messages: SummaryMessage[]) {
  const lines = messages.map((message) => {
    const prefix = message.role === "user" ? "用户" : "助手";
    return `- ${prefix}: ${truncateText(message.content.replace(/\s+/g, " "), 240)}`;
  });
  return truncateText([previousSummary, "近期压缩记录：", ...lines].filter(Boolean).join("\n"), AGENT_SESSION_SUMMARY_CHARS);
}
