"use client";

import Image from "next/image";
import type { AgentMood } from "./types";
import { moodAvatar } from "./avatarAssets";

const moodColors: Record<AgentMood, string> = {
  idle: "#10b981", listening: "#3b82f6", thinking: "#f59e0b",
  success: "#22c55e", warning: "#f97316", confirm: "#8b5cf6", error: "#ef4444",
};

const moodPulse: Record<AgentMood, boolean> = {
  idle: false, listening: true, thinking: true,
  success: false, warning: false, confirm: true, error: false,
};

export default function AgentAvatar({
  mood, size = 48, src: srcOverride,
}: {
  mood: AgentMood;
  size?: number;
  /** 覆盖默认 mood 图片，用于姿态/表情切换 */
  src?: string;
}) {
  const color = moodColors[mood];
  const pulse = moodPulse[mood];
  const src = srcOverride || moodAvatar[mood];

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {/* 状态光环 */}
      <div
        className={`absolute inset-0 rounded-full transition-colors duration-500 ${
          pulse ? "animate-pulse" : ""
        }`}
        style={{ boxShadow: `0 0 ${size * 0.3}px ${color}40, 0 0 ${size * 0.15}px ${color}60` }}
      />
      {/* 图片 */}
      <Image
        src={src}
        alt={mood}
        width={size}
        height={size}
        className="relative z-10 rounded-full object-cover"
        unoptimized
      />
    </div>
  );
}
