"use client";

import { useEffect, useMemo, useState } from "react";
import { createMessageSection, type BodySurfaceProps, type BodySurfaceSectionSpec } from "@workspace/core/ui";
import { type PermissionActionKey } from "@workspace/platform/permission-actions";
import { requestJson } from "@workspace/platform/ui/api-client";
import { createAdminSelectorSplitBody } from "../components/AdminSelectorSplit";
import { createPermissionMatrixSection } from "../components/permissions/MatrixTable";
import type { ResourceTreeNode } from "../components/ResourceTree";
import type { PermissionsTabState } from "../hooks/usePermissionsTab";

type SpaceEntryKind = string;
type SpaceType = "personal" | "department" | "committee" | "company" | "project";
export type SpaceFilter = "all" | "department" | "project";

interface UnifiedSpaceResourceDto {
  key: string;
  name: string;
  entryKind: SpaceEntryKind;
  resourceKey: string;
  targetType: SpaceType;
  targetId: number;
  scopeId: string;
  permissionsPath: string;
  docsSpaceId?: string;
  supportedActions: PermissionActionKey[];
  canAccess: boolean;
  canManage: boolean;
}

interface UnifiedSpaceDto {
  key: string;
  name: string;
  spaceType: SpaceType;
  targetId: number;
  subtitle: string | null;
  resourceKey: string | null;
  scopeId: string;
  permissionsPath: string | null;
  supportedActions: PermissionActionKey[];
  canManage: boolean;
  managementVisible: boolean;
  children: UnifiedSpaceResourceDto[];
}

interface UnifiedSpacesResponse {
  spaces?: UnifiedSpaceDto[];
}

interface SpaceEntry extends ResourceTreeNode {
  entryKind?: SpaceEntryKind;
  target?: UnifiedSpaceResourceDto;
  canManage?: boolean;
}

function toTreeEntry(space: UnifiedSpaceDto): SpaceEntry | null {
  if (space.spaceType === "personal" || !space.managementVisible) return null;
  const children = space.children
    .filter((child) => space.canManage || child.canManage)
    .map((child): SpaceEntry => ({
      key: child.key,
      name: child.name,
      statusLabel: "L2",
      statusVariant: "green",
      entryKind: child.entryKind,
      target: child,
      canManage: child.canManage,
    }));
  if (!space.canManage && children.length === 0) return null;
  const target = space.resourceKey && space.permissionsPath
    ? {
        key: space.key,
        name: space.name,
        entryKind: "space",
        resourceKey: space.resourceKey,
        targetType: space.spaceType,
        targetId: space.targetId,
        scopeId: space.scopeId,
        permissionsPath: space.permissionsPath,
        supportedActions: space.supportedActions,
        canAccess: true,
        canManage: space.canManage,
      } satisfies UnifiedSpaceResourceDto
    : undefined;
  return {
    key: space.key,
    name: space.name,
    statusLabel: "L1",
    statusVariant: "gray",
    entryKind: "space",
    target,
    canManage: space.canManage,
    selectableWithChildren: true,
    children,
  };
}

function flattenEntries(entries: SpaceEntry[]): SpaceEntry[] {
  return entries.flatMap((entry) => [entry, ...(entry.children ? flattenEntries(entry.children as SpaceEntry[]) : [])]);
}

function filterSpaceEntries(entries: SpaceEntry[], filter: SpaceFilter) {
  if (filter === "all") return entries;
  return entries
    .filter((entry) => filter === "department"
      ? entry.target?.targetType === "department" || entry.target?.targetType === "committee"
      : entry.target?.targetType === filter);
}

async function loadUnifiedSpaces() {
  const data = await requestJson<UnifiedSpacesResponse>("/api/settings/account/spaces?scope=all", {
    fallbackMessage: "加载空间权限入口失败",
  });
  return (data.spaces ?? []).map(toTreeEntry).filter((entry): entry is SpaceEntry => Boolean(entry));
}

export function useSpacePermissionsTabBody({
  enabled,
  onToast,
  spaceFilter = "all",
  s,
}: {
  enabled: boolean;
  onToast: (message: string, type?: "success" | "error") => void;
  spaceFilter?: SpaceFilter;
  s: PermissionsTabState;
}): BodySurfaceProps {
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<SpaceEntry[]>([]);
  const [selectedEntryKey, setSelectedEntryKey] = useState<string | null>(null);
  const visibleEntries = useMemo(() => filterSpaceEntries(entries, spaceFilter), [entries, spaceFilter]);
  const selectedEntry = useMemo(
    () => flattenEntries(visibleEntries).find((entry) => entry.key === selectedEntryKey && entry.entryKind && entry.target && entry.canManage) ?? null,
    [selectedEntryKey, visibleEntries],
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    loadUnifiedSpaces()
      .then((nextEntries) => {
        if (cancelled) return;
        setEntries(nextEntries);
      })
      .catch((error) => {
        if (!cancelled) onToast(error instanceof Error ? error.message : "加载空间权限入口失败", "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, onToast]);

  useEffect(() => {
    setSelectedEntryKey((current) => {
      if (current && flattenEntries(visibleEntries).some((entry) => entry.key === current && entry.entryKind && entry.target && entry.canManage)) return current;
      return null;
    });
  }, [visibleEntries]);

  const setResourceContext = s.setResourceContext;
  useEffect(() => {
    if (!enabled) return;
    if (!selectedEntry?.target) {
      setResourceContext({ resourceKey: null, scopeId: null, projection: "space" });
      return;
    }
    setResourceContext({
      resourceKey: selectedEntry.target.resourceKey,
      scopeId: selectedEntry.target.scopeId,
      projection: "space",
    });
  }, [enabled, selectedEntry, setResourceContext]);

  const sections: BodySurfaceSectionSpec[] = selectedEntry
    ? [
        ...(s.loading
          ? [createMessageSection("space-permissions-matrix-loading", { content: "加载权限...", tone: "muted" })]
          : [{
              ...createMessageSection("space-permissions-mobile-boundary", {
                content: "权限矩阵需要同时核对空间、主体与动作，请在桌面端维护。",
                tone: "muted",
              }),
              visibility: "mobile" as const,
            }, createPermissionMatrixSection({ s })]),
      ]
    : [createMessageSection("space-permissions-empty", { content: "请选择左侧空间资源", tone: "muted" })];

  const bodySections = loading
    ? [createMessageSection("space-permissions-loading", { content: "加载空间入口...", tone: "muted" as const })]
    : sections;

  return createAdminSelectorSplitBody({
    title: "空间权限",
    items: visibleEntries,
    selectedId: selectedEntryKey,
    sections: bodySections,
    onSelect: (entry) => {
      if (!entry.entryKind || !entry.target || !entry.canManage) return;
      s.setResourceContext({
        resourceKey: entry.target.resourceKey,
        scopeId: entry.target.scopeId,
        projection: "space",
      });
      setSelectedEntryKey(entry.key);
    },
    emptyContent: "暂无可管理空间",
  });
}
