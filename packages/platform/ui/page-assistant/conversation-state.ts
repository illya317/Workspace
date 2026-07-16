import type { AssistantMessage, PendingAttachment } from "./types";

export type ConversationSnapshot = {
  messages: AssistantMessage[];
  draft: string;
  attachments: PendingAttachment[];
  sessionId: string | null;
  sessionSummary: string | null;
  busyProposalId: number | null;
};

export function createEmptyConversationSnapshot(): ConversationSnapshot {
  return {
    messages: [],
    draft: "",
    attachments: [],
    sessionId: null,
    sessionSummary: null,
    busyProposalId: null,
  };
}
