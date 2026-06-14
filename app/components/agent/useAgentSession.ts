"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { AgentMood, AgentMessage } from "./types";

let _msgId = 0;
function nextMsgId(): string { return `msg-${Date.now()}-${++_msgId}`; }
function nextConvId(): string { return `conv-${Date.now()}-${++_msgId}`; }

function makeMessage(role: AgentMessage["role"], content: string, data?: unknown): AgentMessage {
  return { id: nextMsgId(), role, content, timestamp: Date.now(), data };
}

interface ProposalInfo {
  proposal: { id: number; actionKey: string; targetType: string; targetId?: string; diff: Record<string, unknown> };
  summary: string;
}

export interface SavedConversation {
  id: string;
  title: string;
  preview: string;
  messages: AgentMessage[];
  createdAt: number;
  updatedAt: number;
}

const HISTORY_KEY = "agentHistory_v3";

function loadHistory(): SavedConversation[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
}
function saveHistory(list: SavedConversation[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 50))); } catch { /* */ }
}

interface AgentResponse {
  type: "answer" | "error" | "clarification" | "proposal";
  message: string;
  toolUsed?: string;
  data?: unknown;
  proposal?: ProposalInfo["proposal"];
}

export function useAgentSession() {
  // ── state ──
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [mood, setMood] = useState<AgentMood>("idle");
  const [loading, setLoading] = useState(false);
  const [drawerMsg, setDrawerMsg] = useState<AgentMessage | null>(null);
  const [pendingProposal, setPendingProposal] = useState<ProposalInfo | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [savedConversations, setSavedConversations] = useState<SavedConversation[]>(() => loadHistory());

  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<AgentMessage[]>([]);
  const pendingRef = useRef(pendingProposal);
  const historyRef = useRef<SavedConversation[]>(savedConversations);
  const activeIdRef = useRef<string | null>(null);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { pendingRef.current = pendingProposal; }, [pendingProposal]);
  useEffect(() => { historyRef.current = savedConversations; }, [savedConversations]);
  useEffect(() => { activeIdRef.current = activeConversationId; }, [activeConversationId]);

  // ── upsert conversation ──
  function upsertConversation(id: string, nextMessages: AgentMessage[]) {
    const firstUser = nextMessages.find((m) => m.role === "user");
    const lastNonSystem = [...nextMessages].reverse().find((m) => m.role !== "system");
    const title = firstUser?.content.slice(0, 30) || "新对话";
    const preview = lastNonSystem?.content.slice(0, 60) || "";
    const now = Date.now();
    const existing = historyRef.current.find((c) => c.id === id);

    const conv: SavedConversation = {
      id, title, preview, messages: nextMessages, createdAt: existing?.createdAt ?? now, updatedAt: now,
    };

    const updated = [conv, ...historyRef.current.filter((c) => c.id !== id)]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 50);

    historyRef.current = updated;
    saveHistory(updated);
    setSavedConversations(updated);
  }

  // ── add message ──
  const addMessage = useCallback((role: AgentMessage["role"], content: string, data?: unknown) => {
    const msg = makeMessage(role, content, data);
    setMessages((prev) => [...prev, msg]);
    return msg;
  }, []);

  // ── send ──
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // 确保有 session id
    const sessionId = activeIdRef.current ?? nextConvId();
    if (!activeIdRef.current) setActiveConversationId(sessionId);

    const userMsg = makeMessage("user", text.trim());
    const beforeMessages = [...messagesRef.current, userMsg];
    setMessages(beforeMessages);
    setMood("thinking");
    setLoading(true);

    const history = beforeMessages
      .filter((m) => m.role === "user" || m.role === "agent")
      .slice(-10)
      .map((m) => ({ role: m.role as "user" | "agent", content: m.content }));

    try {
      const res = await fetch("/workspace/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), history }),
        signal: controller.signal,
      });

      if (!res.ok) {
        if (res.status === 401) { window.location.href = "/login"; return; }
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        const errMsg = makeMessage("system", err.error || "请求失败");
        const errMessages = [...beforeMessages, errMsg];
        setMessages(errMessages);
        upsertConversation(sessionId, errMessages);
        setMood("error");
        return;
      }

      const data: AgentResponse = await res.json();
      let finalMessages: AgentMessage[];

      if (data.type === "proposal" && data.proposal) {
        const agentMsg = makeMessage("agent", data.message);
        finalMessages = [...beforeMessages, agentMsg];
        setMessages(finalMessages);
        setPendingProposal({ proposal: data.proposal, summary: data.message });
        setMood("confirm");
      } else if (data.type === "error") {
        const sysMsg = makeMessage("system", data.message);
        finalMessages = [...beforeMessages, sysMsg];
        setMessages(finalMessages);
        setMood("error");
      } else {
        const agentMsg = makeMessage("agent", data.message, data.data);
        finalMessages = [...beforeMessages, agentMsg];
        setMessages(finalMessages);
        setMood(data.type === "clarification" ? "warning" : "success");
        setTimeout(() => setMood("idle"), 3000);
      }

      upsertConversation(sessionId, finalMessages);
    } catch (err: unknown) {
      if (err instanceof Error && (err.name === "AbortError" || err.name === "TypeError")) return;
      const sysMsg = makeMessage("system", "网络请求失败，请稍后重试");
      const errMessages = [...beforeMessages, sysMsg];
      setMessages(errMessages);
      upsertConversation(sessionId, errMessages);
      setMood("error");
    } finally {
      setLoading(false);
    }
  }, [loading]);

  // ── cleanup ──
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // ── proposal actions ──
  const confirmProposal = useCallback(async () => {
    const p = pendingRef.current;
    if (!p) return;
    const res = await fetch(`/workspace/api/agent/proposals/${p.proposal.id}/confirm`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "确认失败" }));
      throw new Error(err.error || "确认失败");
    }
    const data = await res.json();
    addMessage("system", `✅ ${data.message}`);
    setPendingProposal(null);
    setMood("success");
    setTimeout(() => setMood("idle"), 3000);
  }, [addMessage]);

  const cancelProposal = useCallback(async () => {
    const p = pendingRef.current;
    if (!p) return;
    fetch(`/workspace/api/agent/proposals/${p.proposal.id}/cancel`, { method: "POST" }).catch(() => {});
    addMessage("system", "已取消变更");
    setPendingProposal(null);
    setMood("idle");
  }, [addMessage]);

  // ── 新对话：保存当前会话后切到空白 ──
  const clearMessages = useCallback(() => {
    if (activeIdRef.current && messagesRef.current.length > 0) {
      upsertConversation(activeIdRef.current, messagesRef.current);
    }
    setActiveConversationId(null);
    setMessages([]);
    setDrawerMsg(null);
    setPendingProposal(null);
    setMood("idle");
  }, []);

  // ── 加载历史会话 ──
  const loadConversation = useCallback((conv: SavedConversation) => {
    setActiveConversationId(conv.id);
    setMessages(conv.messages);
    setDrawerMsg(null);
    setPendingProposal(null);
    setMood("idle");
  }, []);

  return {
    messages, mood, loading,
    drawerMsg, setDrawerMsg,
    pendingProposal, confirmProposal, cancelProposal,
    sendMessage, clearMessages, savedConversations, loadConversation,
  };
}
