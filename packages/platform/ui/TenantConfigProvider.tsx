"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { TenantPublicConfig } from "../tenant-config";

const TenantConfigContext = createContext<TenantPublicConfig | null>(null);

export function TenantConfigProvider({
  config,
  children,
}: {
  config: TenantPublicConfig;
  children: ReactNode;
}) {
  return <TenantConfigContext.Provider value={config}>{children}</TenantConfigContext.Provider>;
}

export function useTenantConfig() {
  const config = useContext(TenantConfigContext);
  if (!config) throw new Error("useTenantConfig must be used inside TenantConfigProvider");
  return config;
}
