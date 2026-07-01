"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
              { kind: "text", value: "天然最高权限", tone: "muted" },
            ],
          }
        : { kind: "text", value: row.userName, emphasis: "medium" },
    },
    {
      key: "role",
      label: "权限",
      defaultVisible: true,
      cell: (row) => row.locked ? { kind: "text", value: businessSpaceRoleLabel(row.role) } : {
        kind: "input",
        spec: {
          valueType: "string",
          control: "choice",
          options: { source: "static", items: normalizedRoleOptions, visibleCount: 4 },
        },
        value: row.role,
        onChange: (value) => patchRow(row.userId, {
          role: normalizeBusinessSpaceRole(value == null ? null : String(value)),
        }),
      },
    },
  ], [normalizedRoleOptions]);

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

  function patchRow(userId: number, patch: Partial<SpacePermissionRow>) {
    setRows((current) => current.map((row) => row.userId === userId ? { ...row, ...patch } : row));
  }

  function addDraft() {
    if (!draft.userId) return;
    if (rows.some((row) => row.userId === draft.userId)) {
      onToast({ type: "error", message: duplicateText });
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
          visibleColumns: ["role"],
          rowKey: (row) => row.userId,
          presentation: { density: "compact" },
          loading,
          emptyText: "暂无额外授权",
          rowActions: getPermissionRowActions,
          scroll: { y: "hidden" },
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
