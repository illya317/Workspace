"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { AgentMood, AgentMessage } from "./types";

let _msgId = 0;
function nextId(): string { return `msg-${Date.now()}-${++_msgId}`; }

interface ProposalInfo {
  proposal: { id: number; actionKey: string; targetType: string; targetId?: string; diff: Record<string, unknown> };
  summary: string;
}

export interface SavedConversation {
  id: string;
  title: string;
  messages: AgentMessage[];
  createdAt: number;
}

function loadHistory(): SavedConversation[] {
  try { return JSON.parse(localStorage.getItem("agentHistory") || "[]"); } catch { return []; }
}
function saveHistory(list: SavedConversation[]) {
  try { localStorage.setItem("agentHistory", JSON.stringify(list.slice(0, 50))); } catch { /* */ }
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
  const historyRef = useRef<SavedConversation[]>([]);
  const [savedConversations, setSavedConversations] = useState<SavedConversation[]>(() => {
    const raw = loadHistory();
    const seen = new Set<string>();
    return raw.filter((c) => {
      const fp = `${c.title}|${c.messages.length}`;
      if (seen.has(fp)) return false; seen.add(fp); return true;
    });
  });
  useEffect(() => {
    historyRef.current = savedConversations;
    saveHistory(savedConversations);
  }, [savedConversations]);

  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<AgentMessage[]>([]);
  const pendingRef = useRef(pendingProposal);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { pendingRef.current = pendingProposal; }, [pendingProposal]);

  // ── helpers ──
  const addMessage = useCallback((role: AgentMessage["role"], content: string, data?: unknown) => {
    const msg: AgentMessage = { id: nextId(), role, content, timestamp: Date.now(), data };
    setMessages((prev) => [...prev, msg]);
    return msg;
  }, []);

  // ── send ──
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    addMessage("user", text.trim());
    setMood("thinking");
    setLoading(true);

    const history = messagesRef.current
      .filter((m) => m.role === "user" || m.role === "agent")
      .slice(-10)
      .map((m) => ({ role: m.role as "user" | "agent", content: m.content }));

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), history }),
        signal: controller.signal,
      });

      if (!res.ok) {
        if (res.status === 401) { window.location.href = "/login"; return; }
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        addMessage("system", err.error || "请求失败");
        setMood("error");
        return;
      }

      const data: AgentResponse = await res.json();

      if (data.type === "proposal" && data.proposal) {
        addMessage("agent", data.message);
        setPendingProposal({ proposal: data.proposal, summary: data.message });
        setMood("confirm");
        return;
      }
      if (data.type === "clarification") {
        addMessage("agent", data.message);
        setMood("warning");
      } else if (data.type === "error") {
        addMessage("system", data.message);
        setMood("error");
      } else {
        addMessage("agent", data.message, data.data);
        setMood("success");
      }

      setTimeout(() => setMood("idle"), 3000);
    } catch (err: unknown) {
      if (err instanceof Error && (err.name === "AbortError" || err.name === "TypeError")) return;
      addMessage("system", "网络请求失败，请稍后重试");
      setMood("error");
    } finally {
      setLoading(false);
    }
  }, [loading, addMessage]);

  // ── cleanup ──
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // ── proposal actions ──
  const confirmProposal = useCallback(async () => {
    const p = pendingRef.current;
    if (!p) return;
    const res = await fetch(`/api/agent/proposals/${p.proposal.id}/confirm`, { method: "POST" });
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
    fetch(`/api/agent/proposals/${p.proposal.id}/cancel`, { method: "POST" }).catch(() => {});
    addMessage("system", "已取消变更");
    setPendingProposal(null);
    setMood("idle");
  }, [addMessage]);

  const clearMessages = useCallback(() => {
    if (messages.length > 0) {
      const title = messages.find((m) => m.role === "user")?.content.slice(0, 30) || "空对话";
      const conv: SavedConversation = { id: nextId(), title, messages: [...messages], createdAt: Date.now() };
      const updated = [conv, ...historyRef.current].slice(0, 50);
      historyRef.current = updated;
      saveHistory(updated);
      setSavedConversations(updated);
    }
    setMessages([]);
    setDrawerMsg(null);
    setPendingProposal(null);
    setMood("idle");
  }, [messages]);

  const loadConversation = useCallback((conv: SavedConversation) => {
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
