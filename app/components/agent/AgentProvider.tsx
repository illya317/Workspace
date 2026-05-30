"use client";

import { useState, useCallback } from "react";
import { useAgentSession } from "./useAgentSession";
import AgentFloatingButton from "./AgentFloatingButton";
import AgentPanel from "./AgentPanel";

export default function AgentProvider() {
  const [isOpen, setIsOpen] = useState(false);
  const { messages, mood, loading, sendMessage, clearMessages } = useAgentSession();

  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <>
      <AgentFloatingButton mood={mood} isOpen={isOpen} onToggle={toggle} />
      <AgentPanel
        mood={mood}
        messages={messages}
        loading={loading}
        isOpen={isOpen}
        onClose={close}
        onSend={sendMessage}
        onClear={clearMessages}
      />
    </>
  );
}
