"use client";

import type { AgentMood, AgentMessage } from "./types";
import AgentAvatar from "./AgentAvatar";

interface Props {
  mood: AgentMood;
  messages: AgentMessage[];
  isOpen: boolean;
  onClose: () => void;
}

export default function AgentPanel({ mood, messages, isOpen, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed z-50 flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
      style={{
        right: 24,
        bottom: 96,
        width: 360,
        maxHeight: "70vh",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-gradient-to-r from-emerald-50 to-white">
        <AgentAvatar mood={mood} size={32} />
        <div className="flex-1">
          <div className="text-sm font-semibold text-gray-800">小助手</div>
          <div className="text-xs text-gray-500">
            {mood === "idle" && "有什么可以帮你的？"}
            {mood === "listening" && "正在听..."}
            {mood === "thinking" && "思考中..."}
            {mood === "success" && "查询完成"}
            {mood === "warning" && "需要确认"}
            {mood === "confirm" && "等待确认"}
            {mood === "error" && "出错了"}
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ minHeight: 120 }}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AgentAvatar mood="idle" size={40} />
            <p className="mt-3 text-sm text-gray-500">我是你的内部系统小助手</p>
            <p className="mt-1 text-xs text-gray-400">
              可以帮你查询数据、生成报告
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5 justify-center">
              {["查员工信息", "看预算执行", "查工作清单"].map((hint) => (
                <span key={hint} className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600">
                  {hint}
                </span>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "agent" && (
                <div className="mr-2 mt-0.5 shrink-0">
                  <AgentAvatar mood={mood} size={20} />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-emerald-500 text-white"
                    : msg.role === "system"
                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                      : "bg-gray-100 text-gray-800"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input (placeholder for Batch 2) */}
      <div className="border-t px-4 py-3">
        <div className="flex items-center gap-2 rounded-xl border bg-gray-50 px-3 py-2">
          <input
            disabled
            placeholder="输入消息（即将开放）..."
            className="flex-1 bg-transparent text-sm outline-none disabled:text-gray-400"
          />
          <button
            disabled
            className="rounded-lg bg-emerald-400 px-3 py-1 text-xs text-white font-medium disabled:opacity-50"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
