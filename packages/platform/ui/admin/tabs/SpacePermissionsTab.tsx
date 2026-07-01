"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createMessageSection, PageSurface, type BodySurfaceProps, type InputOption } from "@workspace/core/ui";
import { requestJson } from "../../api-client";
import { useSpacePermissionsSections, type SpacePermissionData, type SpacePermissionToggleInput } from "../../SpacePermissionsPanel";
import { createAdminSelectorSplitBody } from "../components/AdminSelectorSplit";
import type { ResourceTreeNode } from "../components/ResourceTree";

type SpaceEntryKind = "work-task" | "work-project" | "docs-editor";
type SpaceType = "personal" | "department" | "committee" | "company";

interface UnifiedSpaceResourceDto {
  key: string;
  name: string;
  entryKind: SpaceEntryKind;
  resourceKey: "work.tasks" | "work.projects" | "docs.editor";
  targetType: SpaceType;
  targetId: number;
  scopeId: string;
  permissionsPath: string;
  docsSpaceId?: string;
  canAccess: boolean;
  canManage: boolean;
}

interface UnifiedSpaceDto {
  key: string;
  name: string;
  spaceType: SpaceType;
  targetId: number;
  subtitle: string | null;
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
    .filter((child) => child.canManage)
    .map((child): SpaceEntry => ({
      key: child.key,
      name: child.name,
      entryKind: child.entryKind,
      target: child,
      canManage: child.canManage,
    }));
  if (children.length === 0) return null;
  return {
    key: space.key,
    name: space.name,
    children,
  };
}

function flattenEntries(entries: SpaceEntry[]): SpaceEntry[] {
  return entries.flatMap((entry) => [entry, ...(entry.children ? flattenEntries(entry.children as SpaceEntry[]) : [])]);
}

function firstSelectable(entries: SpaceEntry[]) {
  return flattenEntries(entries).find((entry) => entry.entryKind && entry.target) ?? null;
}

async function loadUnifiedSpaces() {
  const data = await requestJson<UnifiedSpacesResponse>("/api/settings/account/spaces", {
    fallbackMessage: "加载空间权限入口失败",
  });
  return (data.spaces ?? []).map(toTreeEntry).filter((entry): entry is SpaceEntry => Boolean(entry));
}

function listEntryPermissions(entry: SpaceEntry) {
  if (!entry.target) throw new Error("空间入口无效");
  return requestJson<SpacePermissionData>(entry.target.permissionsPath, {
    fallbackMessage: "加载空间权限失败",
  });
}

function setEntryPermissionGrant(entry: SpaceEntry, input: SpacePermissionToggleInput) {
  if (!entry.target) throw new Error("空间入口无效");
  return requestJson<{ success: true }>(entry.target.permissionsPath, {
    method: "PUT",
    body: JSON.stringify(input),
    fallbackMessage: "保存空间权限失败",
  });
}

export function useSpacePermissionsTabBody({
  enabled,
  onToast,
  nameSearch = "",
  page = 0,
  pageSize = 50,
  onPageMetaChange,
  onNameSearchOptionsChange,
}: {
  enabled: boolean;
  onToast: (message: string, type?: "success" | "error") => void;
  nameSearch?: string;
  page?: number;
  pageSize?: number;
  onPageMetaChange?: (meta: { total: number; totalPages: number }) => void;
  onNameSearchOptionsChange?: (options: InputOption[]) => void;
}): BodySurfaceProps {
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<SpaceEntry[]>([]);
  const [selectedEntryKey, setSelectedEntryKey] = useState<string | null>(null);
  const selectableEntries = useMemo(() => flattenEntries(entries).filter((entry) => entry.entryKind && entry.target), [entries]);
  const selectedEntry = useMemo(
    () => selectableEntries.find((entry) => entry.key === selectedEntryKey) ?? null,
    [selectableEntries, selectedEntryKey],
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    loadUnifiedSpaces()
      .then((nextEntries) => {
        if (cancelled) return;
        setEntries(nextEntries);
        setSelectedEntryKey((current) => {
          if (current && flattenEntries(nextEntries).some((entry) => entry.key === current && entry.entryKind)) return current;
          return firstSelectable(nextEntries)?.key ?? null;
        });
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

  const notifyPermissionToast = useCallback((toast: { message: string; type: "success" | "error" }) => {
    onToast(toast.message, toast.type);
  }, [onToast]);

  const sections = useSpacePermissionsSections({
    target: selectedEntry,
    canManage: Boolean(selectedEntry?.canManage),
    enabled,
    onToast: notifyPermissionToast,
    listPermissions: listEntryPermissions,
    setPermissionActionGrant: setEntryPermissionGrant,
    deniedText: "仅空间管理员可维护权限。",
    loadErrorText: "加载空间权限失败",
    saveErrorText: "保存空间权限失败",
    saveSuccessText: "空间权限已更新",
    nameSearch,
    page,
    pageSize,
    onPageMetaChange,
    onNameSearchOptionsChange,
  });

  const bodySections = loading
    ? [createMessageSection("space-permissions-loading", { content: "加载空间入口...", tone: "muted" as const })]
    : sections;

  return createAdminSelectorSplitBody({
    title: "空间权限",
    items: entries,
    selectedId: selectedEntryKey,
    sections: bodySections,
    onSelect: (entry) => {
      if (!entry.entryKind) return;
      setSelectedEntryKey(entry.key);
    },
    emptyContent: "暂无可管理空间",
  });
}

export default function SpacePermissionsTab(props: {
  enabled: boolean;
  onToast: (message: string, type?: "success" | "error") => void;
  nameSearch?: string;
  page?: number;
  pageSize?: number;
  onPageMetaChange?: (meta: { total: number; totalPages: number }) => void;
  onNameSearchOptionsChange?: (options: InputOption[]) => void;
}) {
  return <PageSurface kind="standard" embedded body={useSpacePermissionsTabBody(props)} />;
}
