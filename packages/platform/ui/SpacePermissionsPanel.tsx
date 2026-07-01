"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionGlyph,
  createPageBody,
  createStatusSection,
  PageSurface,
  type BodySurfaceSectionSpec,
  type DataSurfaceColumnSpec,
  type SurfaceDataRowActionSpec,
  type SurfaceSelectOptionSpec,
} from "@workspace/core/ui";
import {
  BUSINESS_SPACE_ROLE_OPTIONS,
  businessSpaceRoleLabel,
  normalizeBusinessSpaceRole,
  type BusinessSpaceRole,
} from "@workspace/platform/permissions";

const ROLE_ORDER: BusinessSpaceRole[] = ["viewer", "editor", "delete", "manager"];

function roleLevel(role: BusinessSpaceRole): number {
  return ROLE_ORDER.indexOf(role);
}

function roleAtLeast(role: BusinessSpaceRole, required: BusinessSpaceRole): boolean {
  return roleLevel(role) >= roleLevel(required);
}

interface RoleMatrixCellProps {
  row: SpacePermissionRow;
  role: BusinessSpaceRole;
  onClick: () => void;
}

function RoleMatrixCell({ row, role, onClick }: RoleMatrixCellProps) {
  const active = roleAtLeast(row.role, role);
  const locked = row.locked;
  if (locked) {
    if (!active) {
      if (roleLevel(role) > roleLevel(row.role)) {
        return (
          <button
            type="button"
            onClick={onClick}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
            aria-label={`显式授权${businessSpaceRoleLabel(role)}`}
            title={`显式授权${businessSpaceRoleLabel(role)}`}
          >
            <ActionGlyph kind="add" className="h-4 w-4" />
          </button>
        );
      }
      return (
        <button
          type="button"
          disabled
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-100 bg-slate-50 text-slate-300"
          aria-label={`未授权${businessSpaceRoleLabel(role)}（天然权限）`}
          title={`未授权${businessSpaceRoleLabel(role)}（天然权限）`}
        />
      );
    }
    return (
      <button
        type="button"
        disabled
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-amber-100 bg-amber-50 text-amber-700 shadow-sm"
        aria-label={`${businessSpaceRoleLabel(role)}（天然权限）`}
        title={`${businessSpaceRoleLabel(role)}（天然权限）`}
      >
        <ActionGlyph kind="check" className="h-4 w-4" />
      </button>
    );
  }
  if (active) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600 text-white shadow-sm transition hover:bg-emerald-700"
        aria-label={`已授权${businessSpaceRoleLabel(role)}，点击改为${businessSpaceRoleLabel(role)}`}
        title={`已授权${businessSpaceRoleLabel(role)}，点击重选`}
      >
        <ActionGlyph kind="check" className="h-4 w-4" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
      aria-label={`授权${businessSpaceRoleLabel(role)}`}
      title={`授权${businessSpaceRoleLabel(role)}`}
    >
      <ActionGlyph kind="add" className="h-4 w-4" />
    </button>
  );
}

export type SpacePermissionToast = {
  type: "success" | "error";
  message: string;
};

export interface SpacePermissionRow {
  userId: number;
  userName: string;
  role: BusinessSpaceRole;
  kind?: string;
  source?: "natural" | "explicit" | string;
  sourceLabel?: string;
  locked: boolean;
}

type PermissionDraft = {
  userId: number | null;
  userName: string;
  role: BusinessSpaceRole;
};

export interface SpacePermissionsSectionsOptions<TTarget> {
  target: TTarget | null;
  canManage: boolean;
  enabled: boolean;
  onToast: (toast: SpacePermissionToast) => void;
  listPermissions: (target: TTarget) => Promise<SpacePermissionRow[]>;
  savePermissions: (target: TTarget, permissions: Array<{ userId: number; role: BusinessSpaceRole }>) => Promise<unknown>;
  referenceEndpoint: string;
  userFkKey: string;
  permissionKind?: string;
  roleOptions?: readonly SurfaceSelectOptionSpec[];
  defaultRole?: BusinessSpaceRole;
  deniedText?: string;
  duplicateText?: string;
  loadErrorText?: string;
  saveErrorText?: string;
  saveSuccessText?: string;
}

export default function SpacePermissionsPanel<TTarget>({
  target,
  canManage,
  onToast,
  listPermissions,
  savePermissions,
  referenceEndpoint,
  userFkKey,
  permissionKind,
  roleOptions,
  defaultRole,
}: Omit<SpacePermissionsSectionsOptions<TTarget>, "enabled">) {
  const sections = useSpacePermissionsSections({
    target,
    canManage,
    enabled: true,
    onToast,
    listPermissions,
    savePermissions,
    referenceEndpoint,
    userFkKey,
    permissionKind,
    roleOptions,
    defaultRole,
  });
  return <PageSurface kind="standard" embedded body={createPageBody(sections)} />;
}

export function useSpacePermissionsSections<TTarget>({
  target,
  canManage,
  enabled,
  onToast,
  listPermissions,
  savePermissions,
  referenceEndpoint,
  userFkKey,
  permissionKind,
  roleOptions = BUSINESS_SPACE_ROLE_OPTIONS,
  defaultRole = "viewer",
  deniedText = "仅空间管理员可维护权限。",
  duplicateText = "该用户已经在权限列表中",
  loadErrorText = "加载权限失败",
  saveErrorText = "保存权限失败",
  saveSuccessText = "空间权限已保存",
}: SpacePermissionsSectionsOptions<TTarget>): BodySurfaceSectionSpec[] {
  const [rows, setRows] = useState<SpacePermissionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<PermissionDraft>({
    userId: null,
    userName: "",
    role: defaultRole,
  });
  const targetKey = useMemo(() => spacePermissionTargetKey(target), [target]);
  const latest = useRef({
    target,
    onToast,
    listPermissions,
    savePermissions,
    loadErrorText,
    saveErrorText,
    saveSuccessText,
  });

  useEffect(() => {
    latest.current = {
      target,
      onToast,
      listPermissions,
      savePermissions,
      loadErrorText,
      saveErrorText,
      saveSuccessText,
    };
  }, [target, onToast, listPermissions, savePermissions, loadErrorText, saveErrorText, saveSuccessText]);

  const load = useCallback(async () => {
    void targetKey;
    const current = latest.current;
    if (!current.target || !canManage || !enabled) return;
    setLoading(true);
    try {
      setRows(await current.listPermissions(current.target));
    } catch (err) {
      latest.current.onToast({
        type: "error",
        message: err instanceof Error ? err.message : latest.current.loadErrorText,
      });
    } finally {
      setLoading(false);
    }
  }, [canManage, enabled, targetKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const explicitRows = useMemo(() => rows.filter((row) => !row.locked), [rows]);
  const normalizedRoleOptions = useMemo(() => [...roleOptions], [roleOptions]);
  const patchRow = useCallback((userId: number, patch: Partial<SpacePermissionRow>) => {
    setRows((current) => current.map((row) => row.userId === userId ? { ...row, ...patch } : row));
  }, []);
  const columns = useMemo<DataSurfaceColumnSpec<SpacePermissionRow>[]>(() => [
    {
      key: "user",
      label: "用户",
      required: true,
      cell: (row) => row.locked
        ? {
            kind: "group",
            direction: "column",
            items: [
              { kind: "text", value: row.userName, emphasis: "medium" },
              { kind: "text", value: row.sourceLabel || "天然最高权限", tone: "muted" },
            ],
          }
        : { kind: "text", value: row.userName, emphasis: "medium" },
    },
    ...ROLE_ORDER.map<DataSurfaceColumnSpec<SpacePermissionRow>>((role) => ({
      key: role,
      label: businessSpaceRoleLabel(role),
      defaultVisible: true,
      align: "center",
      width: "content",
      cell: (row) => (
        <div className="flex justify-center">
          <RoleMatrixCell
            row={row}
            role={role}
            onClick={() => {
              if (row.locked) {
                if (roleLevel(role) <= roleLevel(row.role)) return;
                patchRow(row.userId, {
                  role,
                  ...(permissionKind ? { kind: permissionKind } : {}),
                  source: "explicit",
                  locked: false,
                });
                return;
              }
              patchRow(row.userId, { role });
            }}
          />
        </div>
      ),
    })),
  ], [patchRow, permissionKind]);

  function getPermissionRowActions(row: SpacePermissionRow): SurfaceDataRowActionSpec[] {
    if (row.locked) return [];
    return [{
      key: "delete",
      kind: "delete",
      label: "移除授权",
      onClick: () => setRows((current) => current.filter((item) => item.userId !== row.userId)),
      disabled: saving,
    }];
  }

  function addDraft() {
    if (!draft.userId) return;
    const existing = rows.find((row) => row.userId === draft.userId);
    if (existing) {
      if (existing.locked) {
        if (roleLevel(draft.role) <= roleLevel(existing.role)) {
          onToast({ type: "error", message: duplicateText });
          return;
        }
        patchRow(draft.userId, {
          role: draft.role,
          ...(permissionKind ? { kind: permissionKind } : {}),
          source: "explicit",
          locked: false,
        });
        setDraft({ userId: null, userName: "", role: defaultRole });
        return;
      }
      patchRow(draft.userId, { role: draft.role });
      setDraft({ userId: null, userName: "", role: defaultRole });
      return;
    }
    setRows((current) => [...current, {
      userId: draft.userId!,
      userName: draft.userName,
      role: draft.role,
      ...(permissionKind ? { kind: permissionKind } : {}),
      source: "explicit",
      locked: false,
    }]);
    setDraft({ userId: null, userName: "", role: defaultRole });
  }

  async function save() {
    const current = latest.current;
    if (!current.target || saving) return;
    setSaving(true);
    try {
      await current.savePermissions(current.target, explicitRows.map((row) => ({ userId: row.userId, role: row.role })));
      await load();
      latest.current.onToast({ type: "success", message: latest.current.saveSuccessText });
    } catch (err) {
      latest.current.onToast({
        type: "error",
        message: err instanceof Error ? err.message : latest.current.saveErrorText,
      });
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) {
    return [createStatusSection("permissions-denied", { kind: "empty", content: deniedText })];
  }

  return [
    {
      key: "permission-draft",
      body: {
        kind: "form",
        form: {
          kind: "fields",
          content: {
            layout: { columns: 3 },
            items: [
              {
                key: "user",
                label: "授权用户",
                spec: {
                  valueType: "reference",
                  control: "reference",
                  options: {
                    source: "remote",
                    fkKey: userFkKey,
                    endpoint: referenceEndpoint,
                    returnField: "id",
                  },
                },
                value: draft.userId ? String(draft.userId) : "",
                displayValue: draft.userName,
                placeholder: "搜索用户",
                onChange: (value, option) => {
                  const fkOption = option as { id?: number; name?: string } | undefined;
                  setDraft((current) => ({
                    ...current,
                    userId: fkOption?.id ?? (value ? current.userId : null),
                    userName: fkOption?.name ?? (value ? String(value) : ""),
                  }));
                },
              },
              {
                key: "role",
                label: "权限",
                spec: {
                  valueType: "string",
                  control: "choice",
                  options: { source: "static", items: normalizedRoleOptions, visibleCount: 4 },
                },
                value: draft.role,
                onChange: (value) => setDraft((current) => ({
                  ...current,
                  role: normalizeBusinessSpaceRole(value == null ? null : String(value)),
                })),
              },
            ],
          },
          commands: [{
            key: "add",
            label: "添加",
            variant: "primary",
            disabled: !draft.userId || saving,
            onClick: addDraft,
          }],
        },
      },
    },
    {
      key: "permission-table",
      body: {
        kind: "data",
        data: {
          kind: "table",
          rows,
          columns,
          rowKey: (row) => row.userId,
          presentation: { density: "compact" },
          loading,
          emptyText: "暂无自然成员或额外授权",
          rowActions: getPermissionRowActions,
          scroll: {},
        },
      },
    },
    {
      key: "permission-actions",
      body: {
        kind: "form",
        form: {
          kind: "filters",
          content: { items: [] },
          commands: [{
            key: "save",
            label: "保存权限",
            variant: "primary",
            disabled: saving,
            onClick: () => void save(),
          }],
        },
      },
    },
  ];
}

function spacePermissionTargetKey(target: unknown): string {
  if (target == null) return "";
  if (typeof target !== "object") return String(target);
  const record = target as Record<string, unknown>;
  if (record.id != null) return `id:${String(record.id)}`;
  if (record.key != null) return `key:${String(record.key)}`;
  if (record.targetType != null && record.targetId != null) {
    return `target:${String(record.targetType)}:${String(record.targetId)}`;
  }
  return stableTargetJson(record);
}

function stableTargetJson(value: unknown): string {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableTargetJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableTargetJson(record[key])}`).join(",")}}`;
}
