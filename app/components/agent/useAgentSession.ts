"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { AgentMood, AgentMessage } from "./types";

let _msgId = 0;
function nextId(): string {
  return `msg-${Date.now()}-${++_msgId}`;
}

interface AgentResponse {
  type: "answer" | "error" | "clarification";
  message: string;
  toolUsed?: string;
  data?: unknown;
}

export function useAgentSession() {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [mood, setMood] = useState<AgentMood>("idle");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const addMessage = useCallback((role: AgentMessage["role"], content: string) => {
    const msg: AgentMessage = { id: nextId(), role, content, timestamp: Date.now() };
    setMessages((prev) => [...prev, msg]);
    return msg;
  }, []);

  const messagesRef = useRef<AgentMessage[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    // 取消上一次请求
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    addMessage("user", text.trim());
    setMood("thinking");
    setLoading(true);

    // 取最近用户+agent消息作为历史（排除system）
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
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        addMessage("system", err.error || "请求失败");
        setMood("error");
        return;
      }

      const data: AgentResponse = await res.json();

      if (data.type === "clarification") {
        addMessage("agent", data.message);
        setMood("warning");
      } else if (data.type === "error") {
        addMessage("system", data.message);
        setMood("error");
      } else {
        // answer — always include data for report expansion
        const content = data.message;
        addMessage("agent", content);
        setMood("success");
      }

      // 3 秒后回到 idle
      setTimeout(() => setMood("idle"), 3000);
    } catch (err: unknown) {
      // 组件卸载、HMR 刷新、用户取消 → 静默忽略
      if (err instanceof Error && (err.name === "AbortError" || err.name === "TypeError")) return;
      addMessage("system", "网络请求失败，请稍后重试");
      setMood("error");
    } finally {
      setLoading(false);
    }
  }, [loading, addMessage]);

  // 组件卸载时取消飞行中的请求（HMR 刷新等场景）
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setMood("idle");
  }, []);

  return { messages, mood, loading, sendMessage, clearMessages };
}
