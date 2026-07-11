"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type AnchorTargets = ReadonlyMap<string, HTMLElement>;

type CreateSurfaceAnchorContextValue = {
  targets: AnchorTargets;
  register: (key: string, node: HTMLElement | null) => void;
};

const CreateSurfaceAnchorContext = createContext<CreateSurfaceAnchorContextValue | null>(null);

export function CreateSurfaceAnchorProvider({ children }: { children: ReactNode }) {
  const parent = useContext(CreateSurfaceAnchorContext);
  const [targets, setTargets] = useState<AnchorTargets>(() => new Map());
  const register = useCallback((key: string, node: HTMLElement | null) => {
    setTargets((current) => {
      const existing = current.get(key);
      if (existing === node || (!existing && !node)) return current;
      const next = new Map(current);
      if (node) next.set(key, node);
      else next.delete(key);
      return next;
    });
  }, []);
  const value = useMemo(() => ({ targets, register }), [register, targets]);
  if (parent) return <>{children}</>;
  return <CreateSurfaceAnchorContext.Provider value={value}>{children}</CreateSurfaceAnchorContext.Provider>;
}

export function CreateSurfaceAnchorTarget({ anchor }: { anchor: string }) {
  const context = useContext(CreateSurfaceAnchorContext);
  const register = context?.register;
  const setTarget = useCallback((node: HTMLDivElement | null) => register?.(anchor, node), [anchor, register]);
  return <div ref={setTarget} />;
}

export function useCreateSurfaceAnchorTarget(anchor?: string) {
  const context = useContext(CreateSurfaceAnchorContext);
  return anchor ? context?.targets.get(anchor) ?? null : null;
}
