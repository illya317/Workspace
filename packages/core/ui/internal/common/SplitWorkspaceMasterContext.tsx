"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { BodySurfaceSplitMasterPresentation } from "../../BodySurface.types";

const SplitWorkspaceMasterPresentationContext = createContext<BodySurfaceSplitMasterPresentation>("default");

export function SplitWorkspaceMasterPresentationProvider({
  children,
  presentation,
}: {
  children: ReactNode;
  presentation: BodySurfaceSplitMasterPresentation;
}) {
  return (
    <SplitWorkspaceMasterPresentationContext.Provider value={presentation}>
      {children}
    </SplitWorkspaceMasterPresentationContext.Provider>
  );
}

export function useSplitWorkspaceMasterPresentation() {
  return useContext(SplitWorkspaceMasterPresentationContext);
}
