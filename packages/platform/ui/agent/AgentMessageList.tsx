"use client";

import { useRef, useEffect } from "react";
import { FormSurface } from "@workspace/core/ui";
import type { AgentMood, AgentMessage } from "./types";
import AgentAvatar from "./AgentAvatar";
function stripMd(t: string): string {
  return t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`(.+?)`/g, "$1").replace(/^#{1,6}\s+/gm, "");
}
interface Props {
  messages: AgentMessage[];
  mood: AgentMood;
  loading: boolean;
  hints: string[];
  hintsLoaded: boolean;
  onHintClick: (hint: string) => void;
  onOpenDrawer: (msg: AgentMessage) => void;
}
export default function AgentMessageList({
  messages,
  mood,
  loading,
  hints,
  hintsLoaded,
  onHintClick,
  onOpenDrawer
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth"
    });
  }, [messages, loading]);
  return <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{
    minHeight: 160
  }}>
      {messages.length === 0 ? <div className="flex flex-col items-center justify-center py-8 text-center">
          <AgentAvatar mood="idle" size={40} />
          <p className="mt-3 text-sm text-gray-400">可以帮你查询数据、生成报告</p>
          <div className="mt-4 flex flex-wrap gap-1.5 justify-center">
            {!hintsLoaded ? <span className="text-xs text-gray-300">加载中...</span> : hints.length > 0 ? hints.map(h => (
              <FormSurface
                key={h}
                kind="inline"
                actions={[{ key: h, label: h, onClick: () => onHintClick(h), size: "sm", className: "rounded-full px-2 py-1 text-xs" }]}
              />
            )) : <span className="text-xs text-gray-400">暂无可用功能，请联系管理员</span>}
          </div>
        </div> : messages.map(msg => <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role !== "user" && <div className="mr-2 mt-0.5 shrink-0">
                <AgentAvatar mood={msg.role === "system" ? "error" : mood} size={20} />
              </div>}
            <div className="max-w-[82%]">
              <div className={`rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${msg.role === "user" ? "bg-emerald-500 text-white" : msg.role === "system" ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-gray-100 text-gray-800"}`}>
                {stripMd(msg.content)}
              </div>
              {msg.role === "agent" && !!msg.data && (
                <FormSurface
                  kind="inline"
                  actions={[{ key: "report", label: "查看报告 →", onClick: () => onOpenDrawer(msg), size: "sm", className: "mt-1 px-2 py-1 text-xs" }]}
                />
              )}
            </div>
          </div>)}

      {loading && <div className="flex justify-start">
          <div className="mr-2 mt-0.5 shrink-0"><AgentAvatar mood="thinking" size={20} /></div>
          <div className="bg-gray-100 rounded-xl px-3 py-2 text-sm text-gray-500">
            <span className="inline-flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{
            animationDelay: "0ms"
          }} />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{
            animationDelay: "150ms"
          }} />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{
            animationDelay: "300ms"
          }} />
            </span>
          </div>
        </div>}
      <div ref={bottomRef} />
    </div>;
}
