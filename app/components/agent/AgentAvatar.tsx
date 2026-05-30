"use client";

import type { AgentMood } from "./types";

const moodColors: Record<AgentMood, string> = {
  idle: "#10b981",       // emerald
  listening: "#3b82f6",  // blue
  thinking: "#f59e0b",   // amber
  success: "#22c55e",    // green
  warning: "#f97316",    // orange
  confirm: "#8b5cf6",    // violet
  error: "#ef4444",      // red
};

const moodPulse: Record<AgentMood, boolean> = {
  idle: false,
  listening: true,
  thinking: true,
  success: false,
  warning: false,
  confirm: true,
  error: false,
};

export default function AgentAvatar({ mood, size = 48 }: { mood: AgentMood; size?: number }) {
  const color = moodColors[mood];
  const pulse = moodPulse[mood];

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {/* 状态光环 */}
      <div
        className={`absolute inset-0 rounded-full transition-colors duration-500 ${
          pulse ? "animate-pulse" : ""
        }`}
        style={{
          boxShadow: `0 0 ${size * 0.3}px ${color}40, 0 0 ${size * 0.15}px ${color}60`,
        }}
      />
      {/* 机器人 SVG */}
      <svg
        className="relative z-10"
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* 身体 */}
        <rect x="6" y="14" width="36" height="28" rx="8" fill="white" stroke={color} strokeWidth="1.5" />
        {/* 天线 */}
        <line x1="24" y1="14" x2="24" y2="6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="24" cy="4" r="2.5" fill={color} />
        {/* 眼睛 */}
        <circle cx="18" cy="26" r="3" fill={color} />
        <circle cx="30" cy="26" r="3" fill={color} />
        {/* 眼睛高光 */}
        <circle cx="19" cy="25" r="1" fill="white" />
        <circle cx="31" cy="25" r="1" fill="white" />
        {/* 嘴巴 */}
        {mood === "success" || mood === "idle" ? (
          <path d="M17 34 Q24 39 31 34" stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none" />
        ) : mood === "error" || mood === "warning" ? (
          <path d="M17 34 Q24 30 31 34" stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none" />
        ) : mood === "thinking" ? (
          <>
            <circle cx="21" cy="34" r="1.5" fill={color} />
            <circle cx="24" cy="34" r="1.5" fill={color} opacity={0.4} />
            <circle cx="27" cy="34" r="1.5" fill={color} opacity={0.4} />
          </>
        ) : (
          <line x1="20" y1="34" x2="28" y2="34" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        )}
        {/* 耳朵/侧边 */}
        <rect x="3" y="19" width="4" height="8" rx="1.5" fill={color} opacity={0.3} />
        <rect x="41" y="19" width="4" height="8" rx="1.5" fill={color} opacity={0.3} />
      </svg>
    </div>
  );
}
