"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PageSurfaceCreateSpec } from "../../PageSurface.types";

const BodySurfacePageCreateContext = createContext<PageSurfaceCreateSpec | undefined>(undefined);

export function BodySurfacePageCreateProvider({
  children,
  create,
}: {
  children: ReactNode;
  create?: PageSurfaceCreateSpec;
}) {
  return (
    <BodySurfacePageCreateContext.Provider value={create}>
      {children}
    </BodySurfacePageCreateContext.Provider>
  );
}

export function useBodySurfacePageCreate() {
  return useContext(BodySurfacePageCreateContext);
}
