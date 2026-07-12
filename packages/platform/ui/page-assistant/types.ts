import type { PageAssistantOpenInput } from "@workspace/core/ui";

export type AssistantRole = "user" | "agent";

export type AssistantProposal = {
  id: number;
  actionKey: string;
  targetType: string;
  targetId?: string;
  diff: Record<string, unknown>;
};

export type AssistantAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  previewUrl?: string;
};

export type PendingAttachment = AssistantAttachment & {
  file: File;
  previewUrl: string;
};

export type AssistantMessage = {
  id: string;
  role: AssistantRole;
  content: string;
  attachments?: AssistantAttachment[];
  responseType?: "answer" | "error" | "clarification" | "proposal";
  data?: unknown;
  proposal?: AssistantProposal;
  proposalStatus?: "pending" | "confirmed" | "cancelled";
};

export type AgentResponse = {
  type?: "answer" | "error" | "clarification" | "proposal";
  message?: string;
  data?: unknown;
  proposal?: AssistantProposal;
  error?: string;
  session?: {
    id: string;
    summaryShort?: string | null;
  };
};

export const MAX_IMAGE_ATTACHMENTS = 4;
export const MAX_IMAGE_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
export const IMAGE_TYPES = new Set(IMAGE_ACCEPT.split(","));

export function nextMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function contextLabel(context: PageAssistantOpenInput | null) {
  return context?.contextLabel || context?.title || context?.path || "当前页面";
}

export function contextKey(context: PageAssistantOpenInput | null) {
  return [
    context?.path || "",
    context?.contextLabel || "",
    context?.title || "",
  ].join("::") || "page";
}

export function responseMessage(response: AgentResponse) {
  return response.message || response.error || "没有返回内容。";
}

export function proposalDiffText(proposal: AssistantProposal) {
  try {
    return JSON.stringify(proposal.diff, null, 2);
  } catch {
    return String(proposal.diff);
  }
}

export function attachmentSizeText(size: number) {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(size / 1024))}KB`;
}

export function messageHistoryContent(message: AssistantMessage) {
  const attachments = message.attachments?.length
    ? `\n[图片附件：${message.attachments.map((attachment) => attachment.name).join("；")}]`
    : "";
  return `${message.content}${attachments}`;
}

export function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
