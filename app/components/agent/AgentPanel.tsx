"use client";

import { useState, useRef, useEffect } from "react";
import type { AgentMood, AgentMessage } from "./types";
import AgentAvatar from "./AgentAvatar";
import AgentReportDrawer from "./AgentReportDrawer";

interface Props {
  mood: AgentMood;
  messages: AgentMessage[];
  loading: boolean;
  drawerMsg: AgentMessage | null;
  onOpenDrawer: (msg: AgentMessage) => void;
  onCloseDrawer: () => void;
  isOpen: boolean;
  onClose: () => void;
  onSend: (text: string) => void;
  onClear: () => void;
  hints?: string[];
  hintsLoaded?: boolean;
}

const moodLabels: Record<AgentMood, string> = {
  idle: "有什么可以帮你的？",
  listening: "正在听...",
  thinking: "思考中...",
  success: "查询完成",
  warning: "需要确认",
  confirm: "等待确认",
  error: "出错了",
};

/** 去掉 LLM 输出的 markdown 标记 */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "• ");
}

export default function AgentPanel({
  mood, messages, loading, drawerMsg, onOpenDrawer, onCloseDrawer,
  isOpen, onClose, onSend, onClear, hints, hintsLoaded,
}: Props) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  useEffect(() => { if (isOpen) setTimeout(() => inputRef.current?.focus(), 100); }, [isOpen]);

  function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    onSend(text);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed z-50 flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
        style={{ right: 24, bottom: 96, width: 380, maxHeight: "70vh" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-gradient-to-r from-emerald-50 to-white">
          <AgentAvatar mood={mood} size={32} />
          <div className="flex-1">
            <div className="text-sm font-semibold text-gray-800">小助手</div>
            <div className="text-xs text-gray-500">{moodLabels[mood]}</div>
          </div>
          <button onClick={onClear} className="rounded-lg p-1.5 text-gray-300 hover:text-gray-500 transition" title="清空对话">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ minHeight: 160 }}>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AgentAvatar mood="idle" size={40} />
              <p className="mt-3 text-sm text-gray-500">我是你的内部系统小助手</p>
              <p className="mt-1 text-xs text-gray-400">可以帮你查询数据、生成报告</p>
              <div className="mt-4 flex flex-wrap gap-1.5 justify-center">
                {!hintsLoaded ? (
                  <span className="text-xs text-gray-300">加载中...</span>
                ) : hints && hints.length > 0 ? (
                  hints.map((hint) => (
                    <button key={hint} onClick={() => { setInput(hint); inputRef.current?.focus(); }}
                      className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600 hover:bg-emerald-50 hover:text-emerald-700 transition">
                      {hint}
                    </button>
                  ))
                ) : (
                  <span className="text-xs text-gray-400">暂无可用功能，请联系管理员</span>
                )}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role !== "user" && (
                  <div className="mr-2 mt-0.5 shrink-0">
                    <AgentAvatar mood={msg.role === "system" ? "error" : mood} size={20} />
                  </div>
                )}
                <div className="max-w-[82%]">
                  <div className={`rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-emerald-500 text-white"
                      : msg.role === "system"
                        ? "bg-amber-50 text-amber-700 border border-amber-200"
                        : "bg-gray-100 text-gray-800"
                  }`}>
                    {stripMarkdown(msg.content)}
                  </div>
                  {/* 查看报告按钮 */}
                  {msg.role === "agent" && !!msg.data && (
                    <button
                      onClick={() => onOpenDrawer(msg)}
                      className="mt-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                    >
                      查看报告 →
                    </button>
                  )}
                </div>
              </div>
            ))
          )}

          {loading && (
            <div className="flex justify-start">
              <div className="mr-2 mt-0.5 shrink-0"><AgentAvatar mood="thinking" size={20} /></div>
              <div className="bg-gray-100 rounded-xl px-3 py-2 text-sm text-gray-500">
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t px-4 py-3">
          <div className="flex items-center gap-2 rounded-xl border bg-gray-50 px-3 py-2 focus-within:border-emerald-400 transition-colors">
            <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown} placeholder="输入消息..." disabled={loading}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400 disabled:opacity-50" maxLength={2000} />
            <button onClick={handleSend} disabled={loading || !input.trim()}
              className="rounded-lg bg-emerald-500 px-3 py-1 text-xs text-white font-medium hover:bg-emerald-600 disabled:opacity-40 transition">
              发送
            </button>
          </div>
        </div>
      </div>

      {/* Report Drawer */}
      <AgentReportDrawer message={drawerMsg} onClose={onCloseDrawer} />
    </>
  );
}
