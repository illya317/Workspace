"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type RevealTokens = ReadonlyMap<string, number>;

type BodySurfaceRevealContextValue = {
  requestReveal: (key: string) => void;
  tokens: RevealTokens;
};

const BodySurfaceRevealContext = createContext<BodySurfaceRevealContextValue | null>(null);

export function BodySurfaceRevealProvider({ children }: { children: ReactNode }) {
  const parent = useContext(BodySurfaceRevealContext);
  const [tokens, setTokens] = useState<RevealTokens>(() => new Map());
  const requestReveal = useCallback((key: string) => {
    setTokens((current) => {
      const next = new Map(current);
      next.set(key, (next.get(key) ?? 0) + 1);
      return next;
    });
  }, []);
  const value = useMemo(() => ({ requestReveal, tokens }), [requestReveal, tokens]);
  if (parent) return <>{children}</>;
  return <BodySurfaceRevealContext.Provider value={value}>{children}</BodySurfaceRevealContext.Provider>;
}

export function useBodySurfaceRevealIntent() {
  return useContext(BodySurfaceRevealContext)?.requestReveal ?? null;
}

export function useBodySurfaceRevealToken(key: string) {
  return useContext(BodySurfaceRevealContext)?.tokens.get(key) ?? 0;
}
