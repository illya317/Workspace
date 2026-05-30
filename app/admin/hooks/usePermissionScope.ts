"use client";

import { useState, useCallback, useMemo } from "react";

export type ScopeMode = "global" | "department" | "user";

export interface ScopeState {
  scopeMode: ScopeMode;
  scopeDepartmentId: number | null;
  scopeUserId: number | null;
  scopeTargetName: string;
}

/**
 * Manages scope selection state for scoped resources (work.report).
 * Only active when the selected resource supports scoping.
 */
export function usePermissionScope(resourceKey: string | null) {
  const [scopeMode, setScopeMode] = useState<ScopeMode>("global");
  const [scopeDepartmentId, setScopeDepartmentId] = useState<number | null>(null);
  const [scopeUserId, setScopeUserId] = useState<number | null>(null);
  const [scopeTargetName, setScopeTargetName] = useState("");

  // Whether this resource supports scoping
  const supportsScope = resourceKey === "work.report";

  // Computed scopeId for API calls
  const scopeId = useMemo(() => {
    if (!supportsScope) return undefined;
    if (scopeMode === "global") return null;
    if (scopeMode === "department" && scopeDepartmentId != null) {
      return `department:${scopeDepartmentId}`;
    }
    if (scopeMode === "user" && scopeUserId != null) {
      return `user:${scopeUserId}`;
    }
    return null;
  }, [supportsScope, scopeMode, scopeDepartmentId, scopeUserId]);

  const resetScope = useCallback(() => {
    setScopeMode("global");
    setScopeDepartmentId(null);
    setScopeUserId(null);
    setScopeTargetName("");
  }, []);

  return {
    scopeMode,
    setScopeMode,
    scopeDepartmentId,
    setScopeDepartmentId,
    scopeUserId,
    setScopeUserId,
    scopeTargetName,
    setScopeTargetName,
    scopeId,
    supportsScope,
    resetScope,
  };
}

export type PermissionScopeState = ReturnType<typeof usePermissionScope>;
