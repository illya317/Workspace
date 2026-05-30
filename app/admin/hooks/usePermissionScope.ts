"use client";

import { useState, useCallback, useMemo } from "react";

export type ScopeMode = "global" | "department" | "project";

export interface ScopeState {
  scopeMode: ScopeMode;
  scopeDepartmentId: number | null;
  scopeProjectId: number | null;
  scopeTargetName: string;
}

/**
 * Manages scope selection state for scoped resources (work.report).
 * Only active when the selected resource supports scoping.
 */
export function usePermissionScope(resourceKey: string | null) {
  const [scopeMode, setScopeMode] = useState<ScopeMode>("global");
  const [scopeDepartmentId, setScopeDepartmentId] = useState<number | null>(null);
  const [scopeProjectId, setScopeProjectId] = useState<number | null>(null);
  const [scopeTargetName, setScopeTargetName] = useState("");

  // Whether this resource supports scoping
  const supportsScope = resourceKey === "work.report";

  // Whether a concrete target has been selected for non-global modes
  const isScopeValid = useMemo(() => {
    if (!supportsScope) return true;
    if (scopeMode === "global") return true;
    if (scopeMode === "department") return scopeDepartmentId != null;
    if (scopeMode === "project") return scopeProjectId != null;
    return false;
  }, [supportsScope, scopeMode, scopeDepartmentId, scopeProjectId]);

  // Computed scopeId for API calls
  // Returns undefined when scope is invalid (prevent accidental global writes)
  const scopeId = useMemo(() => {
    if (!supportsScope) return undefined;
    if (scopeMode === "global") return null;
    if (scopeMode === "department" && scopeDepartmentId != null) {
      return `department:${scopeDepartmentId}`;
    }
    if (scopeMode === "project" && scopeProjectId != null) {
      return `project:${scopeProjectId}`;
    }
    return undefined; // scope not fully selected — invalid
  }, [supportsScope, scopeMode, scopeDepartmentId, scopeProjectId]);

  const resetScope = useCallback(() => {
    setScopeMode("global");
    setScopeDepartmentId(null);
    setScopeProjectId(null);
    setScopeTargetName("");
  }, []);

  return {
    scopeMode, setScopeMode,
    scopeDepartmentId, setScopeDepartmentId,
    scopeProjectId, setScopeProjectId,
    scopeTargetName, setScopeTargetName,
    scopeId, isScopeValid,
    supportsScope, resetScope,
  };
}

export type PermissionScopeState = ReturnType<typeof usePermissionScope>;
