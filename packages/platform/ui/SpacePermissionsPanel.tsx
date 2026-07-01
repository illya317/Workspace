"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createPageBody,
  createStatusSection,
  PageSurface,
  type BodySurfaceSectionSpec,
  type InputOption,
} from "@workspace/core/ui";
import type { PermissionActionKey } from "@workspace/platform/permission-actions";
import { matchSearchFields } from "@workspace/platform/search";
import { PermissionActionMatrixGrid } from "./PermissionActionMatrixGrid";
import {
  getPermissionActionRecordSortScore,
  sortPermissionSubjectsByScore,
} from "./permission-matrix-model";

type PermissionSource = "direct" | "position" | "department" | "ancestor" | "implied" | "implicit" | "child" | null;

export interface SpacePermissionSubject {
  id: number;
  name: string;
  extra?: {
    employeeId?: string;
    userId?: number | null;
    hasUser?: boolean;
    username?: string | null;
    department?: string;
    position?: string;
    code?: string;
  };
}

export interface SpacePermissionActionState {
  actionKey: PermissionActionKey;
  label: string;
  has: boolean;
  source: PermissionSource;
  sourceActionKey: PermissionActionKey | null;
  sourceResourceKey: string | null;
  directGrantable: boolean;
  pendingResourceMapping: boolean;
}

export interface SpacePermissionActionRecord {
  subjectId: number;
  actionStates: Record<PermissionActionKey, SpacePermissionActionState>;
}

export interface SpacePermissionData {
  subjects: SpacePermissionSubject[];
  actionRecords: Record<number, SpacePermissionActionRecord>;
  resourceKey: string;
  scopeId: string | null;
}

export type SpacePermissionToast = {
  type: "success" | "error";
  message: string;
};

export type SpacePermissionToggleInput = {
  subjectType: "user";
  subjectId: number;
  actionKey: PermissionActionKey;
  value: boolean;
};

export interface SpacePermissionsSectionsOptions<TTarget> {
  target: TTarget | null;
  canManage: boolean;
  enabled: boolean;
  onToast: (toast: SpacePermissionToast) => void;
  listPermissions: (target: TTarget) => Promise<SpacePermissionData>;
  setPermissionActionGrant: (target: TTarget, input: SpacePermissionToggleInput) => Promise<unknown>;
  deniedText?: string;
  loadErrorText?: string;
  saveErrorText?: string;
  saveSuccessText?: string;
  nameSearch?: string;
  page?: number;
  pageSize?: number;
  onPageMetaChange?: (meta: { total: number; totalPages: number }) => void;
  onNameSearchOptionsChange?: (options: InputOption[]) => void;
}

function subjectContent(subject: SpacePermissionSubject) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="truncate font-medium text-slate-800">{subject.name}</span>
      {subject.extra?.employeeId ? <span className="truncate font-mono text-xs text-slate-400">{subject.extra.employeeId}</span> : null}
      {!subject.extra?.hasUser ? <span className="truncate text-xs text-red-500">未关联账号</span> : null}
    </div>
  );
}

function subjectRowKey(subject: SpacePermissionSubject) {
  return subject.extra?.employeeId ?? subject.extra?.username ?? String(subject.id);
}

export default function SpacePermissionsPanel<TTarget>({
  target,
  canManage,
  onToast,
  listPermissions,
  setPermissionActionGrant,
}: Omit<SpacePermissionsSectionsOptions<TTarget>, "enabled">) {
  const sections = useSpacePermissionsSections({
    target,
    canManage,
    enabled: true,
    onToast,
    listPermissions,
    setPermissionActionGrant,
  });
  return <PageSurface kind="standard" embedded body={createPageBody(sections)} />;
}

export function useSpacePermissionsSections<TTarget>({
  target,
  canManage,
  enabled,
  onToast,
  listPermissions,
  setPermissionActionGrant,
  deniedText = "仅空间管理员可维护权限。",
  loadErrorText = "加载权限失败",
  saveErrorText = "保存权限失败",
  saveSuccessText = "权限已更新",
  nameSearch = "",
  page = 0,
  pageSize,
  onPageMetaChange,
  onNameSearchOptionsChange,
}: SpacePermissionsSectionsOptions<TTarget>): BodySurfaceSectionSpec[] {
  const [data, setData] = useState<SpacePermissionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set());
  const targetKey = useMemo(() => spacePermissionTargetKey(target), [target]);
  const filteredData = useMemo(() => {
    if (!data) return null;
    const keyword = nameSearch.trim();
    const matchedSubjects = keyword
      ? data.subjects.filter((subject) => matchSearchFields({
          name: subject.name,
          employeeId: subject.extra?.employeeId,
          username: subject.extra?.username,
          department: subject.extra?.department,
          position: subject.extra?.position,
        }, keyword, ["name", "employeeId", "username", "department", "position"]))
      : data.subjects;
    const subjects = sortPermissionSubjectsByScore(
      matchedSubjects,
      (subject) => getPermissionActionRecordSortScore(data.actionRecords[subject.id]),
    );
    const total = subjects.length;
    const size = pageSize && pageSize > 0 ? pageSize : total || 1;
    const totalPages = Math.max(1, Math.ceil(total / size));
    const safePage = Math.min(Math.max(page, 0), totalPages - 1);
    return {
      ...data,
      subjects: subjects.slice(safePage * size, safePage * size + size),
      total,
      totalPages,
    };
  }, [data, nameSearch, page, pageSize]);

  const nameSearchOptions = useMemo<InputOption[]>(() => {
    if (!data) return [];
    const options = new Map<string, InputOption>();
    for (const subject of data.subjects) {
      const name = subject.name.trim();
      if (!name || options.has(name)) continue;
      const employeeId = String(subject.extra?.employeeId ?? "");
      options.set(name, {
        value: name,
        label: employeeId ? `${name} ${employeeId}` : name,
        searchText: [
          name,
          employeeId,
          subject.extra?.username,
          subject.extra?.department,
          subject.extra?.position,
        ].filter(Boolean).join(" "),
      });
    }
    return Array.from(options.values());
  }, [data]);

  useEffect(() => {
    if (!filteredData) {
      onPageMetaChange?.({ total: 0, totalPages: 1 });
      return;
    }
    onPageMetaChange?.({ total: filteredData.total, totalPages: filteredData.totalPages });
  }, [filteredData, onPageMetaChange]);

  useEffect(() => {
    onNameSearchOptionsChange?.(nameSearchOptions);
  }, [nameSearchOptions, onNameSearchOptionsChange]);

  const load = useCallback(async () => {
    void targetKey;
    if (!target || !canManage || !enabled) return;
    setLoading(true);
    try {
      const next = await listPermissions(target);
      setData(next);
      setExpandedRows((currentExpanded) => {
        if (currentExpanded.size > 0) return currentExpanded;
        const firstDirect = sortPermissionSubjectsByScore(
          next.subjects,
          (subject) => getPermissionActionRecordSortScore(next.actionRecords[subject.id]),
        ).find((subject) => getPermissionActionRecordSortScore(next.actionRecords[subject.id]) > 0);
        return firstDirect ? new Set([subjectRowKey(firstDirect)]) : currentExpanded;
      });
    } catch (err) {
      onToast({ type: "error", message: err instanceof Error ? err.message : loadErrorText });
    } finally {
      setLoading(false);
    }
  }, [canManage, enabled, listPermissions, loadErrorText, onToast, target, targetKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleExpand = useCallback((subjectKey: string) => {
    setExpandedRows((current) => {
      const next = new Set(current);
      if (next.has(subjectKey)) next.delete(subjectKey);
      else next.add(subjectKey);
      return next;
    });
  }, []);

  const toggleGrant = useCallback(async (subject: SpacePermissionSubject, state: SpacePermissionActionState) => {
    const subjectId = subject.extra?.userId ?? subject.id;
    if (!target || !subjectId || !subject.extra?.hasUser) {
      onToast({ type: "error", message: "该员工未关联账号，无法授权" });
      return;
    }
    const key = `${subjectRowKey(subject)}:${state.actionKey}`;
    setSavingKey(key);
    try {
      await setPermissionActionGrant(target, {
        subjectType: "user",
        subjectId,
        actionKey: state.actionKey,
        value: state.source === "direct" ? !state.has : true,
      });
      await load();
      onToast({ type: "success", message: saveSuccessText });
    } catch (err) {
      onToast({ type: "error", message: err instanceof Error ? err.message : saveErrorText });
    } finally {
      setSavingKey(null);
    }
  }, [load, onToast, saveErrorText, saveSuccessText, setPermissionActionGrant, target]);

  if (!canManage) return [createStatusSection("permissions-denied", { kind: "empty", content: deniedText })];
  if (loading) return [createStatusSection("permission-table-loading", { kind: "empty", content: "加载权限..." })];
  if (!data || !filteredData) return [createStatusSection("permission-table-empty", { kind: "empty", content: "请选择空间" })];
  if (filteredData.subjects.length === 0) return [createStatusSection("permission-table-empty", { kind: "empty", content: nameSearch.trim() ? "无匹配结果" : "暂无可授权用户" })];

  return [{
    key: "permission-table",
    body: {
      kind: "document",
      document: {
        kind: "pages",
        pages: {
          items: [{
            key: "space-permission-matrix-grid",
            size: "fluid",
            content: (
              <PermissionActionMatrixGrid
                subjects={filteredData.subjects}
                subjectColumnLabel="姓名"
                getSubjectKey={subjectRowKey}
                renderSubject={subjectContent}
                getRecord={(subject) => filteredData.actionRecords[subject.id]}
                expandedKeys={expandedRows}
                onToggleExpand={(subject) => toggleExpand(subjectRowKey(subject))}
                onToggleAction={toggleGrant}
                canToggleAction={(subject) => Boolean(subject.extra?.hasUser && subject.extra?.userId)}
                savingKey={savingKey}
              />
            ),
          }],
        },
      },
    },
  }];
}

function spacePermissionTargetKey(target: unknown): string {
  if (target == null) return "";
  if (typeof target !== "object") return String(target);
  const record = target as Record<string, unknown>;
  if (record.id != null) return `id:${String(record.id)}`;
  if (record.key != null) return `key:${String(record.key)}`;
  if (record.targetType != null && record.targetId != null) return `target:${String(record.targetType)}:${String(record.targetId)}`;
  return stableTargetJson(record);
}

function stableTargetJson(value: unknown): string {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableTargetJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableTargetJson(record[key])}`).join(",")}}`;
}
