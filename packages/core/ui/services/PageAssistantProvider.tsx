"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";

export type PageAssistantOpenInput = {
  contextLabel?: string;
  path?: string;
  title?: string;
  sourceContext?: {
    navigationLabel?: string;
    activeKey?: string;
    activeLabel?: string;
    activeChildKey?: string;
    activeChildLabel?: string;
  };
};

export type PageAssistantContextValue = {
  enabled: boolean;
  openAssistant: (input?: PageAssistantOpenInput) => void;
  setCurrentContext: (input?: PageAssistantOpenInput) => void;
};

const PageAssistantContext = createContext<PageAssistantContextValue>({
  enabled: false,
  openAssistant: () => {},
  setCurrentContext: () => {},
});

export function PageAssistantProvider({
  children,
  onOpen,
  onContextChange,
}: {
  children: ReactNode;
  onOpen: (input?: PageAssistantOpenInput) => void;
  onContextChange?: (input?: PageAssistantOpenInput) => void;
}) {
  const openAssistant = useCallback((input?: PageAssistantOpenInput) => {
    onOpen(input);
  }, [onOpen]);
  const setCurrentContext = useCallback((input?: PageAssistantOpenInput) => {
    onContextChange?.(input);
  }, [onContextChange]);

  const value = useMemo<PageAssistantContextValue>(() => ({
    enabled: true,
    openAssistant,
    setCurrentContext,
  }), [openAssistant, setCurrentContext]);

  return (
    <PageAssistantContext.Provider value={value}>
      {children}
    </PageAssistantContext.Provider>
  );
}

export function usePageAssistant() {
  return useContext(PageAssistantContext);
}
