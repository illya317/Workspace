"use client";

import { useState, useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAgentSession } from "./useAgentSession";
import AgentFloatingButton from "./AgentFloatingButton";
import { coreMoods, preloadImages } from "./avatarAssets";
import AgentPanel from "./AgentPanel";
import AgentConfirmModal from "./AgentConfirmModal";
import { stripAgentBasePath, withAgentBasePath } from "./paths";

const PUBLIC_PATHS = new Set(["/", "/login"]);

export default function AgentProvider() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const {
    messages, mood, loading, drawerMsg, setDrawerMsg,
    pendingProposal, confirmProposal, cancelProposal,
    sendMessage, stopMessage, clearMessages, savedConversations, loadConversation,
  } = useAgentSession();
  const [hints, setHints] = useState<string[]>([]);
  const [hintsLoaded, setHintsLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);

  const normalizedPath = stripAgentBasePath(pathname);
  const isPublicPath = PUBLIC_PATHS.has(normalizedPath);

  useEffect(() => {
    setIsOpen(false);
    setEnabled(false);
    if (isPublicPath) return;

    let cancelled = false;
    fetch(withAgentBasePath("/api/agent/capabilities"))
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (cancelled) return;
        setEnabled(Array.isArray(d?.capabilities));
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });

    return () => { cancelled = true; };
  }, [isPublicPath, pathname]);

  useEffect(() => {
    if (!enabled || !isOpen) return;
    preloadImages(coreMoods);
    setHintsLoaded(false);
    fetch(withAgentBasePath("/api/agent/capabilities"))
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        setHints(d?.capabilities?.map((c: { label: string }) => c.label) ?? []);
        setHintsLoaded(true);
      })
      .catch(() => { setHints([]); setHintsLoaded(true); });
  }, [enabled, isOpen]);

  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const close = useCallback(() => setIsOpen(false), []);

  if (!enabled) return null;

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
        onStop={stopMessage}
        onClear={clearMessages}
        savedConversations={savedConversations}
        onLoadConversation={loadConversation}
        hints={hints}
        hintsLoaded={hintsLoaded}
      />
      {pendingProposal && (
        <AgentConfirmModal
          proposal={pendingProposal.proposal}
          summary={pendingProposal.summary}
          onConfirm={confirmProposal}
          onCancel={cancelProposal}
        />
      )}
    </>
  );
}
