"use client";

import { useState, useCallback } from "react";
import type { AgentMood, AgentMessage } from "./types";
import AgentFloatingButton from "./AgentFloatingButton";
import AgentPanel from "./AgentPanel";

export default function AgentProvider() {
  const [isOpen, setIsOpen] = useState(false);
  const [mood, _setMood] = useState<AgentMood>("idle");
  const [messages, _setMessages] = useState<AgentMessage[]>([]);

  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <>
      <AgentFloatingButton mood={mood} isOpen={isOpen} onToggle={toggle} />
      <AgentPanel mood={mood} messages={messages} isOpen={isOpen} onClose={close} />
    </>
  );
}
