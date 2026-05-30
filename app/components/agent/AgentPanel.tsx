"use client";

import { useState, useRef, useEffect } from "react";
import type { AgentMood, AgentMessage } from "./types";
import type { SavedConversation } from "./useAgentSession";
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
  savedConversations?: SavedConversation[];
  onLoadConversation?: (conv: SavedConversation) => void;
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
  isOpen, onClose, onSend, onClear, savedConversations, onLoadConversation,
  hints, hintsLoaded,
}: Props) {
  const [input, setInput] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null);

  // 拖动 header 移动面板
  function onHeaderDown(e: React.PointerEvent) {
    const rect = (e.currentTarget as HTMLElement).closest("[data-panel]")?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { sx: e.clientX, sy: e.clientY, px: rect.left, py: rect.top };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onHeaderMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.sx;
    const dy = e.clientY - dragRef.current.sy;
    const x = Math.max(0, Math.min(window.innerWidth - 380, dragRef.current.px + dx));
    const y = Math.max(0, Math.min(window.innerHeight - 100, dragRef.current.py + dy));
    setPanelPos({ x, y });
  }
  function onHeaderUp() { dragRef.current = null; }

  // 点击外部关闭历史下拉
  useEffect(() => {
    if (!showHistory) return;
    function onClick(e: MouseEvent) {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showHistory]);

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
        data-panel
        className="fixed z-50 flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
        style={panelPos
          ? { left: panelPos.x, top: panelPos.y, width: 380, maxHeight: "70vh" }
          : { right: 24, bottom: 96, width: 380, maxHeight: "70vh" }
        }
      >
        {/* Header — 可拖动 */}
        <div
          className="flex items-center gap-3 px-4 py-3 border-b bg-gradient-to-r from-emerald-50 to-white cursor-grab active:cursor-grabbing select-none"
          onPointerDown={onHeaderDown}
          onPointerMove={onHeaderMove}
          onPointerUp={onHeaderUp}
        >
          <AgentAvatar mood={mood} size={32} />
          <div className="flex-1">
            <div className="text-sm font-semibold text-gray-800">小助手</div>
            <div className="text-xs text-gray-500">{moodLabels[mood]}</div>
          </div>
          {/* History */}
          <div className="relative">
            <button onClick={() => setShowHistory(!showHistory)}
              className="rounded-lg p-1.5 text-gray-300 hover:text-gray-500 transition disabled:opacity-30"
              disabled={!savedConversations || savedConversations.length === 0}
              title="历史对话">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            {showHistory && savedConversations && savedConversations.length > 0 && (
              <div ref={historyRef} className="absolute right-0 top-8 w-64 bg-white rounded-xl shadow-xl border z-50 max-h-64 overflow-y-auto">
                <div className="px-3 py-2 text-xs font-medium text-gray-400 border-b">历史对话</div>
                {savedConversations.map((c) => (
                  <button key={c.id}
                    onClick={() => { onLoadConversation?.(c); setShowHistory(false); }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition border-b last:border-0">
                    <div className="truncate font-medium">{c.title}</div>
                    <div className="truncate text-xs text-gray-400">{c.preview || c.messages.slice(-1)[0]?.content.slice(0, 40)}</div>
                    <div className="text-xs text-gray-300">{new Date(c.updatedAt).toLocaleString("zh-CN")}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={onClear} className="rounded-lg p-1.5 text-gray-300 hover:text-gray-500 transition" title="新对话">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
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
              <p className="mt-3 text-sm text-gray-400">可以帮你查询数据、生成报告</p>
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
