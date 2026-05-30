"use client";

import { useState, useCallback, useMemo } from "react";
import type { ResourceItem } from "../types";

export type ScopeMode = "global" | "department" | "project";

export interface ScopeState {
  scopeMode: ScopeMode;
  scopeDepartmentId: number | null;
  scopeProjectId: number | null;
  scopeTargetName: string;
}

/**
 * Manages scope selection state for scoped resources.
 * scopeTypes is read from the selected resource's DB field.
 * E.g. "department,project" → supports department and project scopes.
 */
export function usePermissionScope(
  resourceKey: string | null,
  resources: ResourceItem[],
) {
  const [scopeMode, setScopeMode] = useState<ScopeMode>("global");
  const [scopeDepartmentId, setScopeDepartmentId] = useState<number | null>(null);
  const [scopeProjectId, setScopeProjectId] = useState<number | null>(null);
  const [scopeTargetName, setScopeTargetName] = useState("");

  // Find the selected resource to read its scopeTypes
  const selectedResource = useMemo(() => {
    if (!resourceKey) return null;
    function find(nodes: ResourceItem[]): ResourceItem | null {
      for (const n of nodes) {
        if (n.key === resourceKey) return n;
        if (n.children) {
          const f = find(n.children);
          if (f) return f;
        }
      }
      return null;
    }
    return find(resources);
  }, [resourceKey, resources]);

  // DB-driven: scope selector only for self_only scoped data resources
  const isSelfOnly = selectedResource?.scopeInheritanceMode === "self_only";
  const supportsScope = isSelfOnly && !!(selectedResource?.scopeTypes);
  const scopeTypeList = useMemo(
    () => (selectedResource?.scopeTypes || "").split(",").filter(Boolean),
    [selectedResource?.scopeTypes],
  );

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
    supportsScope, scopeTypeList, resetScope,
  };
}

export type PermissionScopeState = ReturnType<typeof usePermissionScope>;
