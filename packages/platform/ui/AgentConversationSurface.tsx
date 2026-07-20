"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ActionGlyph, NavigationContextSelector, type PageAssistantOpenInput } from "@workspace/core/ui";
import { workspacePath } from "@workspace/core/routing";

import { PageAssistantComposer } from "./page-assistant/PageAssistantComposer";
import { AgentConversationEmptyState, PageAssistantMessages } from "./page-assistant/PageAssistantMessages";
import { readAgentStream } from "./page-assistant/agent-stream";
import { createEmptyConversationSnapshot, type ConversationSnapshot } from "./page-assistant/conversation-state";
import { useAgentProfileSelector } from "./page-assistant/useAgentProfileSelector";
import {
  contextKey,
  contextLabel,
  IMAGE_TYPES,
  isAbortError,
  MAX_IMAGE_ATTACHMENTS,
  MAX_IMAGE_ATTACHMENT_BYTES,
  messageHistoryContent,
  nextMessageId,
  responseMessage,
  type AgentConversationStarter,
  type AssistantMessage,
  type PendingAttachment,
} from "./page-assistant/types";

export type { AgentConversationStarter } from "./page-assistant/types";
export function AgentConversationSurface({
  open,
  context,
  onClose,
  enabled = true,
  variant = "panel",
  title = "页面助手",
  emptyTitle = "开始和页面助手对话",
  emptyDescription = "它会结合当前页面和栏目理解你的问题。",
  starters = [],
  disabledMessage = "当前账号没有 Agent 助手调用权限。",
  showAgentProfileSelector = true,
}: {
  open: boolean;
  context: PageAssistantOpenInput | null;
  onClose?: () => void;
  enabled?: boolean;
  variant?: "panel" | "workspace";
  title?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  starters?: AgentConversationStarter[];
  disabledMessage?: string;
  showAgentProfileSelector?: boolean;
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
  const abortActiveRequest = useCallback(() => abortControllerRef.current?.abort(), []);
  const { selectedAgentProfileId, selector: agentProfileSelector } = useAgentProfileSelector({
    open: open && enabled && showAgentProfileSelector,
    onBeforeChange: abortActiveRequest,
  });
  const currentContextLabel = useMemo(() => contextLabel(context), [context]);
  const currentContextKey = useMemo(() => `${contextKey(context)}::agent-profile:${selectedAgentProfileId ?? "self"}`, [context, selectedAgentProfileId]);
  const activeContextKeyRef = useRef(currentContextKey);

  useEffect(() => {
    if (!open || variant === "workspace") return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [open, variant]);

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
      if (event.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open || messages.length === 0) return;
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
    const restored = conversationsRef.current.get(currentContextKey) ?? createEmptyConversationSnapshot();
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
    const snapshot = conversationsRef.current.get(key) ?? createEmptyConversationSnapshot();
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
    const snapshot = conversationsRef.current.get(key) ?? createEmptyConversationSnapshot();
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

  async function submitMessage(event?: FormEvent<HTMLFormElement>, prompt?: string) {
    event?.preventDefault();
    if (!enabled) return;
    const requestContextKey = activeContextKeyRef.current;
    const question = (prompt ?? draft).trim();
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
    const agentMessageId = nextMessageId("agent-stream");
    const fallbackHistory = sessionId ? undefined : messages.map((message) => ({
      role: message.role,
      content: messageHistoryContent(message),
    }));

    updateMessagesForContext(requestContextKey, (current) => [
      ...current,
      userMessage,
      {
        id: agentMessageId,
        role: "agent",
        content: "正在处理…",
        responseType: "answer",
      },
    ]);
    setDraft("");
    setAttachments([]);
    setSending(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const payload = {
        sessionId,
        agentProfileId: selectedAgentProfileId,
        message: question,
        context: {
          contextLabel: context?.contextLabel,
          path: context?.path,
          title: context?.title,
          sourceContext: context?.sourceContext,
        },
        history: fallbackHistory,
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
      let receivedText = false;
      const body = await readAgentStream(response, (streamEvent) => {
        if (streamEvent.event === "heartbeat") return;
        if (streamEvent.event === "status") {
          if (receivedText) return;
          updateMessagesForContext(requestContextKey, (current) => current.map((message) => (
            message.id === agentMessageId ? { ...message, content: streamEvent.message } : message
          )));
          return;
        }
        if (streamEvent.event === "delta") {
          const replace = !receivedText;
          receivedText = true;
          updateMessagesForContext(requestContextKey, (current) => current.map((message) => (
            message.id === agentMessageId
              ? { ...message, content: replace ? streamEvent.delta : `${message.content}${streamEvent.delta}` }
              : message
          )));
        }
      });
      if (body.session?.id) {
        updateSessionForContext(requestContextKey, body.session.id, body.session.summaryShort);
      }
      updateMessagesForContext(requestContextKey, (current) => current.map((message) => (
        message.id === agentMessageId
          ? {
              ...message,
              content: responseMessage(body),
              responseType: body.type,
              data: body.data,
              proposal: body.proposal,
              proposalStatus: body.proposal ? "pending" : undefined,
            }
          : message
      )));
    } catch (error) {
      if (isAbortError(error)) {
        updateMessagesForContext(requestContextKey, (current) => current.map((message) => (
          message.id === agentMessageId
            ? { ...message, content: "已中止当前请求。", responseType: "answer" }
            : message
        )));
        return;
      }
      updateMessagesForContext(requestContextKey, (current) => current.map((message) => (
        message.id === agentMessageId
          ? {
              ...message,
              content: error instanceof Error ? error.message : "请求失败。",
              responseType: "error",
            }
          : message
      )));
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        if (activeContextKeyRef.current === requestContextKey) {
          setSending(false);
        }
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

  const emptyState = (
    <AgentConversationEmptyState
      title={emptyTitle}
      description={emptyDescription}
      starters={starters}
      enabled={enabled}
      disabledMessage={disabledMessage}
      onPrompt={(prompt) => void submitMessage(undefined, prompt)}
    />
  );
  const wrapperClassName = variant === "workspace"
    ? "mx-auto flex h-[calc(100dvh-8.75rem)] w-full max-w-6xl p-0 sm:h-[calc(100dvh-4.25rem)] sm:px-4 sm:py-4"
    : "fixed inset-0 z-50 sm:inset-x-auto sm:bottom-3 sm:left-auto sm:right-5 sm:top-auto sm:w-[420px]";
  const sectionClassName = variant === "workspace"
    ? "flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-white sm:rounded-xl sm:border sm:border-slate-200 sm:shadow-[0_24px_80px_rgba(15,23,42,0.10)]"
    : "flex h-[100dvh] flex-col overflow-hidden bg-white sm:h-[min(620px,calc(100vh-7rem))] sm:min-h-[420px] sm:rounded-lg sm:border sm:border-slate-200 sm:shadow-2xl";

  return (
    <div className={wrapperClassName}>
      <section
        aria-label={title}
        className={sectionClassName}
      >
        <header className="flex items-center gap-2 border-b border-slate-200 px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:items-start sm:gap-3 sm:px-4 sm:py-3">
          <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 sm:flex">
            <ActionGlyph kind="assistant" className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="shrink-0 text-sm font-semibold text-slate-900">{title}</h2>
              {enabled && showAgentProfileSelector ? <NavigationContextSelector selector={agentProfileSelector} /> : null}
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {sessionSummary ? `已压缩上下文 · ${currentContextLabel}` : currentContextLabel}
            </p>
          </div>
          {enabled ? (
            <button
              type="button"
              title="新会话"
              aria-label="新会话"
              onClick={startNewSession}
              className="flex size-11 shrink-0 items-center justify-center rounded-xl text-slate-500 active:bg-slate-100 sm:size-9 sm:rounded-md sm:border sm:border-slate-200 sm:hover:bg-slate-50 sm:hover:text-slate-800"
            >
              <ActionGlyph kind="add" className="size-5 sm:size-4" />
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              title="关闭"
              aria-label={`关闭${title}`}
              onClick={onClose}
              className="order-first flex size-11 shrink-0 items-center justify-center rounded-xl text-slate-600 active:bg-slate-100 sm:order-none sm:size-9 sm:rounded-md sm:border sm:border-slate-200 sm:text-slate-500 sm:hover:bg-slate-50 sm:hover:text-slate-800"
            >
              <ActionGlyph kind="back" className="size-6 sm:hidden" />
              <ActionGlyph kind="x" className="hidden size-4 sm:block" />
            </button>
          ) : null}
        </header>

        <PageAssistantMessages
          messages={messages}
          sending={sending}
          busyProposalId={busyProposalId}
          scrollRef={scrollRef}
          settleProposal={settleProposal}
          emptyState={emptyState}
        />
        {enabled ? (
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
        ) : null}
      </section>
    </div>
  );
}
