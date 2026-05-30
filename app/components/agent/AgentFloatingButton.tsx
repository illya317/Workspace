"use client";

import { useState } from "react";
import type { AgentMood } from "./types";
import { useAgentPosition } from "./useAgentPosition";
import AgentAvatar from "./AgentAvatar";
import { mainAvatar, poseAvatar } from "./avatarAssets";

interface Props {
  mood: AgentMood;
  isOpen: boolean;
  onToggle: () => void;
}

export default function AgentFloatingButton({ mood, isOpen, onToggle }: Props) {
  const { position, mounted, isDragging, onPointerDown, onPointerMove, onPointerUp, wasClick } = useAgentPosition();
  const [hovered, setHovered] = useState(false);

  function handleClick() {
    if (wasClick()) onToggle();
  }

  if (!mounted) return null;

  const avatarSrc = isDragging ? poseAvatar.side
    : isOpen ? poseAvatar.back
    : hovered ? poseAvatar["45front"]
    : mainAvatar;

  return (
    <div
      className={`fixed z-50 select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"} ${
        isOpen ? "pointer-events-none" : ""
      }`}
      style={{
        left: position.x,
        top: position.y,
        width: 56,
        height: 56,
        touchAction: "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="button"
      aria-label="小助手"
      title="小助手"
    >
      <div className={`
        flex items-center justify-center rounded-full
        bg-white shadow-lg border border-gray-200
        transition-all duration-300 hover:shadow-xl
        ${isDragging ? "scale-110 shadow-xl" : "hover:scale-105"}
        ${isOpen ? "opacity-0 scale-75" : "opacity-100"}
      `}
        style={{ width: 56, height: 56 }}
      >
        <AgentAvatar mood={mood} size={40} src={avatarSrc} />
      </div>
    </div>
  );
}
