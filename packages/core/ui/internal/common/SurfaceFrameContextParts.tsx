"use client";

import { createContext, useContext, type ReactNode } from "react";

const SurfaceFrameDepthContext = createContext(0);

export function SurfaceFrameBoundary({
  children,
  framed,
}: {
  children: ReactNode;
  framed: boolean;
}) {
  const depth = useContext(SurfaceFrameDepthContext);
  return (
    <SurfaceFrameDepthContext.Provider value={framed ? depth + 1 : depth}>
      {children}
    </SurfaceFrameDepthContext.Provider>
  );
}

export function useSurfaceFrameDepth() {
  return useContext(SurfaceFrameDepthContext);
}
