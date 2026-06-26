"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DataSurface, FormSurface, type DataSurfaceColumnSpec, type DataTableRowAction } from "@workspace/core/ui";
import { listSpacePermissions, saveSpacePermissions, WORK_REFERENCE_OPTIONS_ENDPOINT } from "./api";
import { WORK_ROLE_OPTIONS } from "./model";
import type { WorkSpacePermissionRow, WorkSpaceRole, WorkTarget } from "./types";
type PermissionDraft = {
  userId: number | null;
  userName: string;
  role: WorkSpaceRole;
};
export default function WorkPermissionsPanel({
  target,
  canManage,
  onToast
}: {
  target: WorkTarget | null;
  canManage: boolean;
  onToast: (toast: {
    type: "success" | "error";
    message: string;
  }) => void;
}) {
  const [rows, setRows] = useState<WorkSpacePermissionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<PermissionDraft>({
    userId: null,
    userName: "",
    role: "viewer"
  });
  const load = useCallback(async () => {
    if (!target || !canManage) return;
    setLoading(true);
    try {
      setRows(await listSpacePermissions(target));
    } catch (err) {
      onToast({
        type: "error",
        message: err instanceof Error ? err.message : "加载权限失败"
      });
    } finally {
      setLoading(false);
    }
  }, [canManage, onToast, target]);
  useEffect(() => {
    void load();
  }, [load]);
  const explicitRows = useMemo(() => rows.filter(row => !row.locked), [rows]);
  const columns = useMemo<DataSurfaceColumnSpec<WorkSpacePermissionRow>[]>(() => [{
    key: "user",
    label: "用户",
    required: true,
    cell: row => <div className="flex flex-col">
          <span className="font-medium text-slate-900">{row.userName}</span>
          {row.locked && <span className="text-xs text-slate-400">天然最高权限</span>}
        </div>
  }, {
    key: "role",
    label: "权限",
    defaultVisible: true,
    cell: row => row.locked ? roleLabel(row.role) : <FormSurface kind="inline" field={{ key: `role-${row.userId}`, label: "权限", spec: { valueType: "string", editor: "select", options: { source: "static", items: [...WORK_ROLE_OPTIONS], visibleCount: 4 } }, value: row.role, onChange: value => patchRow(row.userId, {
      role: normalizeRole(value == null ? null : String(value))
    }) }} />
  }], []);
  function getPermissionRowActions(row: WorkSpacePermissionRow): DataTableRowAction[] {
    if (row.locked) return [];
    return [{
      key: "delete",
      kind: "delete",
      label: "移除授权",
      onClick: () => setRows(current => current.filter(item => item.userId !== row.userId)),
      disabled: saving
    }];
  }
  function patchRow(userId: number, patch: Partial<WorkSpacePermissionRow>) {
    setRows(current => current.map(row => row.userId === userId ? {
      ...row,
      ...patch
    } : row));
  }
  function addDraft() {
    if (!draft.userId) return;
    if (rows.some(row => row.userId === draft.userId)) {
      onToast({
        type: "error",
        message: "该用户已经在权限列表中"
      });
      return;
    }
    setRows(current => [...current, {
      userId: draft.userId!,
      userName: draft.userName,
      role: draft.role,
      kind: "task",
      source: "explicit",
      locked: false
    }]);
    setDraft({
      userId: null,
      userName: "",
      role: "viewer"
    });
  }
  async function save() {
    if (!target || saving) return;
    setSaving(true);
    try {
      await saveSpacePermissions(target, explicitRows.map(row => ({
        userId: row.userId,
        role: row.role
      })));
      await load();
      onToast({
        type: "success",
        message: "空间权限已保存"
      });
    } catch (err) {
      onToast({
        type: "error",
        message: err instanceof Error ? err.message : "保存权限失败"
      });
    } finally {
      setSaving(false);
    }
  }
  if (!canManage) return <DataSurface kind="records" records={[]} empty="仅空间管理员可维护权限。" />;
  return <div className="space-y-4">
      <FormSurface
        kind="fields"
        columns={3}
        className="rounded-lg border border-slate-200 bg-white p-4"
        fields={[{
          key: "user",
          label: "授权用户",
          spec: { valueType: "reference", editor: "autocomplete", options: { source: "remote", fkKey: "work.tasks.permission.user", endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" } },
          value: draft.userId ? String(draft.userId) : "",
          displayValue: draft.userName,
          placeholder: "搜索用户",
          onChange: (value, option) => {
          const fkOption = option as { id?: number; name?: string } | undefined;
          setDraft(current => ({
          ...current,
          userId: fkOption?.id ?? (value ? current.userId : null),
          userName: fkOption?.name ?? (value ? String(value) : "")
        }));
        },
        }, {
          key: "role",
          label: "权限",
          spec: { valueType: "string", editor: "select", options: { source: "static", items: [...WORK_ROLE_OPTIONS], visibleCount: 4 } },
          value: draft.role,
          onChange: value => setDraft(current => ({
          ...current,
          role: normalizeRole(value == null ? null : String(value))
        })),
        }]}
        actions={[{ key: "add", label: "添加", variant: "primary", disabled: !draft.userId || saving, onClick: addDraft }]}
      />
      <DataSurface
        kind="table"
        rows={rows}
        columns={columns}
        visibleColumns={["role"]}
        rowKey={row => row.userId}
        density="compact"
        loading={loading}
        emptyText="暂无额外授权"
        rowActions={getPermissionRowActions}
        scrollClassName="overflow-y-hidden rounded-lg border border-slate-200"
      />
      <FormSurface kind="inline" actions={[{ key: "save", label: "保存权限", variant: "primary", disabled: saving, onClick: () => void save() }]} className="justify-end" />
    </div>;
}
function normalizeRole(value: string | null): WorkSpaceRole {
  if (value === "manager" || value === "delete" || value === "editor") return value;
  return "viewer";
}
function roleLabel(role: string) {
  if (role === "manager") return "管理";
  if (role === "delete") return "删除";
  if (role === "editor") return "编辑";
  return "查看";
}
