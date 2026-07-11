"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { BotMessageSquare, Plus, X } from "lucide-react";
import {
  PageAssistantProvider as CorePageAssistantProvider,
  type PageAssistantOpenInput,
} from "@workspace/core/ui";
import { workspacePath } from "@workspace/core/routing";

import { PageAssistantComposer } from "./page-assistant/PageAssistantComposer";
import { PageAssistantMessages } from "./page-assistant/PageAssistantMessages";
import {
  contextKey,
  contextLabel,
  IMAGE_TYPES,
  isAbortError,
  MAX_HISTORY,
  MAX_IMAGE_ATTACHMENTS,
  MAX_IMAGE_ATTACHMENT_BYTES,
  messageHistoryContent,
  nextMessageId,
  responseMessage,
  type AgentResponse,
  type AssistantMessage,
  type PendingAttachment,
} from "./page-assistant/types";

type ConversationSnapshot = {
  messages: AssistantMessage[];
  draft: string;
  attachments: PendingAttachment[];
  sessionId: string | null;
  sessionSummary: string | null;
  busyProposalId: number | null;
};

export default function WorkspacePageAssistantProvider({ children }: { children: ReactNode }) {
  const [assistantContext, setAssistantContext] = useState<PageAssistantOpenInput | null>(null);
  const [pageContext, setPageContext] = useState<PageAssistantOpenInput | null>(null);
  const handleOpen = useCallback((input?: PageAssistantOpenInput) => {
    setAssistantContext(input ?? pageContext ?? {});
  }, [pageContext]);
  const handleContextChange = useCallback((input?: PageAssistantOpenInput) => {
    setPageContext(input ?? null);
    setAssistantContext((current) => current === null || !input ? current : input);
  }, []);

  return (
    <CorePageAssistantProvider
      onOpen={handleOpen}
      onContextChange={handleContextChange}
    >
      {children}
      <PageAssistantPanel
        open={assistantContext !== null}
        context={assistantContext}
        onClose={() => setAssistantContext(null)}
      />
    </CorePageAssistantProvider>
  );
}

function emptyConversationSnapshot(): ConversationSnapshot {
  return {
    messages: [],
    draft: "",
    attachments: [],
    sessionId: null,
    sessionSummary: null,
    busyProposalId: null,
  };
}

function PageAssistantPanel({
  open,
  context,
  onClose,
}: {
  open: boolean;
  context: PageAssistantOpenInput | null;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [busyProposalId, setBusyProposalId] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionSummary, setSessionSummary] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const conversationsRef = useRef<Map<string, ConversationSnapshot>>(new Map());
  const currentContextLabel = useMemo(() => contextLabel(context), [context]);
  const currentContextKey = useMemo(() => contextKey(context), [context]);
  const activeContextKeyRef = useRef(currentContextKey);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    const previewUrls = previewUrlsRef.current;
    return () => {
      abortControllerRef.current?.abort();
      for (const previewUrl of previewUrls) {
        URL.revokeObjectURL(previewUrl);
      }
      previewUrls.clear();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  useEffect(() => {
    if (!open || activeContextKeyRef.current === currentContextKey) return;
    abortControllerRef.current?.abort();
    conversationsRef.current.set(activeContextKeyRef.current, {
      messages,
      draft,
      attachments,
      sessionId,
      sessionSummary,
      busyProposalId: null,
    });
    const restored = conversationsRef.current.get(currentContextKey) ?? emptyConversationSnapshot();
    setMessages(restored.messages);
    setDraft(restored.draft);
    setAttachments(restored.attachments);
    setSessionId(restored.sessionId);
    setSessionSummary(restored.sessionSummary);
    setBusyProposalId(restored.busyProposalId);
    setSending(false);
    activeContextKeyRef.current = currentContextKey;
  }, [attachments, busyProposalId, currentContextKey, draft, messages, open, sessionId, sessionSummary]);

  function appendLocalError(content: string) {
    setMessages((current) => [
      ...current,
      {
        id: nextMessageId("agent-local-error"),
        role: "agent",
        content,
        responseType: "error",
      },
    ]);
  }

  function revokeAttachmentPreviews(targets: PendingAttachment[]) {
    for (const previewUrl of targets.map((attachment) => attachment.previewUrl)) {
      URL.revokeObjectURL(previewUrl);
      previewUrlsRef.current.delete(previewUrl);
    }
  }

  function updateMessagesForContext(key: string, updater: (current: AssistantMessage[]) => AssistantMessage[]) {
    if (activeContextKeyRef.current === key) {
      setMessages(updater);
      return;
    }
    const snapshot = conversationsRef.current.get(key) ?? emptyConversationSnapshot();
    conversationsRef.current.set(key, {
      ...snapshot,
      messages: updater(snapshot.messages),
    });
  }

  function updateSessionForContext(key: string, nextSessionId: string, nextSummary: string | null | undefined) {
    if (activeContextKeyRef.current === key) {
      setSessionId(nextSessionId);
      setSessionSummary(nextSummary ?? null);
      return;
    }
    const snapshot = conversationsRef.current.get(key) ?? emptyConversationSnapshot();
    conversationsRef.current.set(key, {
      ...snapshot,
      sessionId: nextSessionId,
      sessionSummary: nextSummary ?? null,
    });
  }

  function removeAttachment(id: string) {
    setAttachments((current) => {
      const target = current.find((attachment) => attachment.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        previewUrlsRef.current.delete(target.previewUrl);
      }
      return current.filter((attachment) => attachment.id !== id);
    });
  }

  function addImageAttachments(files: File[]) {
    if (files.length === 0) return;
    const next = [...attachments];
    const errors: string[] = [];

    for (const file of files) {
      if (next.length >= MAX_IMAGE_ATTACHMENTS) {
        errors.push(`一次最多粘贴 ${MAX_IMAGE_ATTACHMENTS} 张图片`);
        break;
      }
      if (!IMAGE_TYPES.has(file.type)) {
        errors.push(`${file.name || "图片"}：仅支持 PNG、JPG、WEBP 或 GIF`);
        continue;
      }
      if (file.size > MAX_IMAGE_ATTACHMENT_BYTES) {
        errors.push(`${file.name || "图片"}：单张图片不能超过 5MB`);
        continue;
      }

      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current.add(previewUrl);
      next.push({
        id: nextMessageId("attachment"),
        name: file.name || "image",
        type: file.type,
        size: file.size,
        previewUrl,
        file,
      });
    }

    setAttachments(next);
    if (errors.length > 0) appendLocalError(errors.join("\n"));
  }

  function stopRequest() {
    abortControllerRef.current?.abort();
  }

  function startNewSession() {
    abortControllerRef.current?.abort();
    revokeAttachmentPreviews(attachments);
    conversationsRef.current.delete(activeContextKeyRef.current);
    setMessages([]);
    setDraft("");
    setAttachments([]);
    setSessionId(null);
    setSessionSummary(null);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function submitMessage(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const requestContextKey = activeContextKeyRef.current;
    const question = draft.trim();
    const outgoingAttachments = attachments;
    if ((!question && outgoingAttachments.length === 0) || sending) return;

    const userMessage: AssistantMessage = {
      id: nextMessageId("user"),
      role: "user",
      content: question || "（图片）",
      attachments: outgoingAttachments.map((attachment) => ({
        id: attachment.id,
        name: attachment.name,
        type: attachment.type,
        size: attachment.size,
        previewUrl: attachment.previewUrl,
      })),
    };
    const history = messages.slice(-MAX_HISTORY).map((message) => ({
      role: message.role,
      content: messageHistoryContent(message),
    }));

    updateMessagesForContext(requestContextKey, (current) => [...current, userMessage]);
    setDraft("");
    setAttachments([]);
    setSending(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const payload = {
        sessionId,
        message: question,
        context: {
          contextLabel: context?.contextLabel,
          path: context?.path,
          title: context?.title,
          sourceContext: context?.sourceContext,
        },
        history,
      };
      const requestInit: RequestInit = {
        method: "POST",
        signal: controller.signal,
      };
      if (outgoingAttachments.length > 0) {
        const formData = new FormData();
        formData.append("payload", JSON.stringify(payload));
        for (const attachment of outgoingAttachments) {
          formData.append("images", attachment.file, attachment.name);
        }
        requestInit.body = formData;
      } else {
        requestInit.headers = { "Content-Type": "application/json" };
        requestInit.body = JSON.stringify(payload);
      }

      const response = await fetch(workspacePath("/api/agent"), requestInit);
      const body = (await response.json()) as AgentResponse;
      if (!response.ok) throw new Error(responseMessage(body));
      if (body.session?.id) {
        updateSessionForContext(requestContextKey, body.session.id, body.session.summaryShort);
      }
      updateMessagesForContext(requestContextKey, (current) => [
        ...current,
        {
          id: nextMessageId("agent"),
          role: "agent",
          content: responseMessage(body),
          responseType: body.type,
          proposal: body.proposal,
          proposalStatus: body.proposal ? "pending" : undefined,
        },
      ]);
    } catch (error) {
      if (isAbortError(error)) {
        updateMessagesForContext(requestContextKey, (current) => [
          ...current,
          {
            id: nextMessageId("agent-aborted"),
            role: "agent",
            content: "已中止当前请求。",
            responseType: "answer",
          },
        ]);
        return;
      }
      updateMessagesForContext(requestContextKey, (current) => [
        ...current,
        {
          id: nextMessageId("agent-error"),
          role: "agent",
          content: error instanceof Error ? error.message : "请求失败。",
          responseType: "error",
        },
      ]);
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      if (activeContextKeyRef.current === requestContextKey) {
        setSending(false);
      }
    }
  }

  async function settleProposal(messageId: string, proposalId: number, action: "confirm" | "cancel") {
    if (busyProposalId) return;
    const requestContextKey = activeContextKeyRef.current;
    setBusyProposalId(proposalId);
    try {
      const response = await fetch(workspacePath(`/api/agent/proposals/${proposalId}/${action}`), {
        method: "POST",
      });
      const body = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(body.message || body.error || "处理失败");

      updateMessagesForContext(requestContextKey, (current) => current.map((message) => {
        if (message.id !== messageId) return message;
        return {
          ...message,
          proposalStatus: action === "confirm" ? "confirmed" : "cancelled",
        };
      }));
      updateMessagesForContext(requestContextKey, (current) => [
        ...current,
        {
          id: nextMessageId("agent-proposal"),
          role: "agent",
          content: body.message || (action === "confirm" ? "变更已执行。" : "变更已取消。"),
          responseType: "answer",
        },
      ]);
    } catch (error) {
      updateMessagesForContext(requestContextKey, (current) => [
        ...current,
        {
          id: nextMessageId("agent-proposal-error"),
          role: "agent",
          content: error instanceof Error ? error.message : "处理失败。",
          responseType: "error",
        },
      ]);
    } finally {
      if (activeContextKeyRef.current === requestContextKey) {
        setBusyProposalId(null);
      }
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 sm:inset-x-auto sm:right-5 sm:w-[420px]">
      <section
        aria-label="页面助手"
        className="flex h-[min(620px,calc(100vh-7rem))] min-h-[420px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex items-start gap-3 border-b border-slate-200 px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
            <BotMessageSquare aria-hidden="true" className="h-5 w-5" strokeWidth={1.9} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-slate-900">页面助手</h2>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {sessionSummary ? `已压缩上下文 · ${currentContextLabel}` : currentContextLabel}
            </p>
          </div>
          <button
            type="button"
            title="新会话"
            aria-label="新会话"
            onClick={startNewSession}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="关闭"
            aria-label="关闭页面助手"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </header>

        <PageAssistantMessages
          messages={messages}
          sending={sending}
          busyProposalId={busyProposalId}
          scrollRef={scrollRef}
          settleProposal={settleProposal}
        />
        <PageAssistantComposer
          attachments={attachments}
          draft={draft}
          inputRef={inputRef}
          sending={sending}
          addImageAttachments={addImageAttachments}
          removeAttachment={removeAttachment}
          setDraft={setDraft}
          stopRequest={stopRequest}
          submitMessage={submitMessage}
        />
      </section>
    </div>
  );
}
