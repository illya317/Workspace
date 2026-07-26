"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface BodySurfaceSplitRuntime {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BodySurfaceSplitContext = createContext<BodySurfaceSplitRuntime | null>(null);

export function BodySurfaceSplitProvider({
  children,
  runtime,
}: {
  children: ReactNode;
  runtime: BodySurfaceSplitRuntime | null;
}) {
  return (
    <BodySurfaceSplitContext.Provider value={runtime}>
      {children}
    </BodySurfaceSplitContext.Provider>
  );
}

export function useBodySurfaceSplitRuntime() {
  return useContext(BodySurfaceSplitContext);
}
