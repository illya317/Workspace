"use client";

import { useCallback, useState, type ReactNode } from "react";
import { PageAssistantProvider as CorePageAssistantProvider, type PageAssistantOpenInput } from "@workspace/core/ui";

import { AgentConversationSurface } from "./AgentConversationSurface";

export default function WorkspacePageAssistantProvider({
  children,
  enabled,
}: {
  children: ReactNode;
  enabled: boolean;
}) {
  const [assistantContext, setAssistantContext] = useState<PageAssistantOpenInput | null>(null);
  const [pageContext, setPageContext] = useState<PageAssistantOpenInput | null>(null);
  const handleOpen = useCallback((input?: PageAssistantOpenInput) => {
    setAssistantContext(input ?? pageContext ?? {});
  }, [pageContext]);
  const handleContextChange = useCallback((input?: PageAssistantOpenInput) => {
    setPageContext(input ?? null);
    setAssistantContext((current) => current === null || !input ? current : input);
  }, []);

  if (!enabled) return children;

  return (
    <CorePageAssistantProvider onOpen={handleOpen} onContextChange={handleContextChange}>
      {children}
      <AgentConversationSurface
        open={assistantContext !== null}
        context={assistantContext}
        emptyTitle={assistantContext?.emptyTitle}
        emptyDescription={assistantContext?.emptyDescription}
        onClose={() => setAssistantContext(null)}
      />
    </CorePageAssistantProvider>
  );
}
