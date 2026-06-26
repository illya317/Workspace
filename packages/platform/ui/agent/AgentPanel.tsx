"use client";

import { useState, useRef, useEffect } from "react";
import { ActionButton, CommandButton, InputControl, PanelCard, SelectorPanel } from "@workspace/core/ui";
import type { AgentMood, AgentMessage } from "./types";
import type { SavedConversation } from "./useAgentSession";
import AgentAvatar from "./AgentAvatar";
import AgentMessageList from "./AgentMessageList";
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
  onStop: () => void;
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
  error: "出错了"
};
export default function AgentPanel({
  mood,
  messages,
  loading,
  drawerMsg,
  onOpenDrawer,
  onCloseDrawer,
  isOpen,
  onClose,
  onSend,
  onStop,
  onClear,
  savedConversations,
  onLoadConversation,
  hints,
  hintsLoaded
}: Props) {
  const [input, setInput] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const historyDropdownRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    sx: number;
    sy: number;
    px: number;
    py: number;
  } | null>(null);
  const [panelPos, setPanelPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // 拖动 header 移动面板
  function onHeaderDown(e: React.PointerEvent) {
    const rect = (e.currentTarget as HTMLElement).closest("[data-panel]")?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = {
      sx: e.clientX,
      sy: e.clientY,
      px: rect.left,
      py: rect.top
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onHeaderMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.sx;
    const dy = e.clientY - dragRef.current.sy;
    const x = Math.max(0, Math.min(window.innerWidth - 380, dragRef.current.px + dx));
    const y = Math.max(0, Math.min(window.innerHeight - 100, dragRef.current.py + dy));
    setPanelPos({
      x,
      y
    });
  }
  function onHeaderUp() {
    dragRef.current = null;
  }

  // 点击外部关闭历史下拉
  useEffect(() => {
    if (!showHistory) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        historyRef.current &&
        !historyRef.current.contains(target) &&
        !historyDropdownRef.current?.contains(target)
      ) {
        setShowHistory(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showHistory]);
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]);
  function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    onSend(text);
    setInput("");
  }
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }
  if (!isOpen) return null;
  return <>
      <div data-panel className="fixed z-50" style={panelPos ? {
      left: panelPos.x,
      top: panelPos.y,
      width: 380,
      maxHeight: "70vh"
    } : {
      right: 24,
      bottom: 96,
      width: 380,
      maxHeight: "70vh"
    }}>
        <PanelCard className="flex h-full flex-col overflow-hidden" bodyClassName="flex min-h-0 flex-1 flex-col">
          {/* Header — 可拖动 */}
          <div className="flex cursor-grab select-none items-center gap-3 border-b bg-gradient-to-r from-emerald-50 to-white px-4 py-3 active:cursor-grabbing" onPointerDown={onHeaderDown} onPointerMove={onHeaderMove} onPointerUp={onHeaderUp}>
            <AgentAvatar mood={mood} size={32} />
            <div>
              <div className="text-sm font-semibold text-gray-800">小助手</div>
              <div className="text-xs text-gray-500">{moodLabels[mood]}</div>
            </div>
            {/* History */}
            <div className="relative">
              <CommandButton onClick={() => setShowHistory(!showHistory)} disabled={!savedConversations || savedConversations.length === 0} title="历史对话" size="sm" className="p-1.5">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </CommandButton>
            </div>
            <CommandButton onClick={onClear} title="新对话" size="sm" className="p-1.5">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </CommandButton>
            <CommandButton onClick={onClose} title="关闭" size="sm" className="p-1.5">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </CommandButton>
          </div>

          {/* Messages */}
          <AgentMessageList messages={messages} mood={mood} loading={loading} hints={hints || []} hintsLoaded={hintsLoaded || false} onHintClick={h => {
          setInput(h);
          inputRef.current?.focus();
        }} onOpenDrawer={onOpenDrawer} />

          {/* Input */}
          <div className="flex items-center gap-2 border-t px-4 py-3">
            <InputControl inputRef={inputRef} spec={{ valueType: "string", editor: "input", state: loading ? "disabled" : "normal" }} value={input} onChange={(value) => setInput(String(value ?? ""))} onKeyDown={handleKeyDown} placeholder="输入消息..." maxLength={2000} />
            {loading ? (
              <ActionButton kind="stop" label="停止生成" variant="primary" onClick={onStop} />
            ) : (
              <ActionButton kind="send" label="发送" variant="primary" onClick={handleSend} disabled={!input.trim()} />
            )}
          </div>
        </PanelCard>
        {showHistory && savedConversations && savedConversations.length > 0 && (
          <div ref={historyDropdownRef}>
            <SelectorPanel className="absolute right-4 top-16 z-[60] max-h-64 w-64 overflow-y-auto" title="历史对话" items={savedConversations} selectedId={null} onSelect={c => {
              onLoadConversation?.(c);
              setShowHistory(false);
            }} getKey={c => c.id} renderItem={c => ({
              title: c.title,
              metaLine: c.preview || c.messages.slice(-1)[0]?.content.slice(0, 60),
              meta: [new Date(c.updatedAt).toLocaleString("zh-CN")]
            })} size="sm" bodyClassName="p-2" contentClassName="space-y-2" />
          </div>
        )}
      </div>

      {/* Report Drawer */}
      <AgentReportDrawer message={drawerMsg} onClose={onCloseDrawer} />
    </>;
}
