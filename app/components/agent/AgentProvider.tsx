"use client";

import { useState, useCallback, useEffect } from "react";
import { useAgentSession } from "./useAgentSession";
import AgentFloatingButton from "./AgentFloatingButton";
import AgentPanel from "./AgentPanel";

export default function AgentProvider() {
  const [isOpen, setIsOpen] = useState(false);
  const { messages, mood, loading, drawerMsg, setDrawerMsg, sendMessage, clearMessages } = useAgentSession();
  const [hints, setHints] = useState<string[]>([]);
  const [hintsLoaded, setHintsLoaded] = useState(false);

  // 面板打开时拉取动态能力清单
  useEffect(() => {
    if (!isOpen) return;
    setHintsLoaded(false);
    fetch("/api/agent/capabilities")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        setHints(d?.capabilities?.map((c: { label: string }) => c.label) ?? []);
        setHintsLoaded(true);
      })
      .catch(() => { setHints([]); setHintsLoaded(true); });
  }, [isOpen]);

  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <>
      <AgentFloatingButton mood={mood} isOpen={isOpen} onToggle={toggle} />
      <AgentPanel
        mood={mood}
        messages={messages}
        loading={loading}
        drawerMsg={drawerMsg}
        onOpenDrawer={setDrawerMsg}
        onCloseDrawer={() => setDrawerMsg(null)}
        isOpen={isOpen}
        onClose={close}
        onSend={sendMessage}
        onClear={clearMessages}
        hints={hints}
        hintsLoaded={hintsLoaded}
      />
    </>
  );
}
