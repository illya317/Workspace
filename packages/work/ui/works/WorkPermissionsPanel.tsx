"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DataTable,
  DataTableActionsCell,
  EmptyStateCard,
  FkFieldInput,
  FormField,
  OptionPicker,
  TableScrollFrame,
  type DataTableColumn,
} from "@workspace/core/ui";
import {
  listSpacePermissions,
  saveSpacePermissions,
  WORK_REFERENCE_OPTIONS_ENDPOINT,
} from "./api";
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
  onToast,
}: {
  target: WorkTarget | null;
  canManage: boolean;
  onToast: (toast: { type: "success" | "error"; message: string }) => void;
}) {
  const [rows, setRows] = useState<WorkSpacePermissionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<PermissionDraft>({ userId: null, userName: "", role: "viewer" });

  const load = useCallback(async () => {
    if (!target || !canManage) return;
    setLoading(true);
    try {
      setRows(await listSpacePermissions(target));
    } catch (err) {
      onToast({ type: "error", message: err instanceof Error ? err.message : "加载权限失败" });
    } finally {
      setLoading(false);
    }
  }, [canManage, onToast, target]);

  useEffect(() => { void load(); }, [load]);

  const explicitRows = useMemo(() => rows.filter((row) => !row.locked), [rows]);
  const columns = useMemo<DataTableColumn<WorkSpacePermissionRow>[]>(() => [
    {
      key: "user",
      label: "用户",
      required: true,
      render: (row) => (
        <div className="flex flex-col">
          <span className="font-medium text-slate-900">{row.userName}</span>
          {row.locked && <span className="text-xs text-slate-400">天然最高权限</span>}
        </div>
      ),
    },
    {
      key: "role",
      label: "权限",
      defaultVisible: true,
      render: (row) => row.locked ? roleLabel(row.role) : (
        <OptionPicker
          value={row.role}
          options={[...WORK_ROLE_OPTIONS]}
          visibleCount={4}
          gridColumnCount={2}
          onChange={(value) => patchRow(row.userId, { role: normalizeRole(value) })}
        />
      ),
    },
    {
      key: "actions",
      label: "操作",
      required: true,
      render: (row) => row.locked ? <span className="text-xs text-slate-300">锁定</span> : (
        <DataTableActionsCell
          actions={[{
            key: "delete",
            kind: "delete",
            label: "移除授权",
            onClick: () => setRows((current) => current.filter((item) => item.userId !== row.userId)),
            disabled: saving,
          }]}
        />
      ),
    },
  ], [saving]);

  function patchRow(userId: number, patch: Partial<WorkSpacePermissionRow>) {
    setRows((current) => current.map((row) => row.userId === userId ? { ...row, ...patch } : row));
  }

  function addDraft() {
    if (!draft.userId) return;
    if (rows.some((row) => row.userId === draft.userId)) {
      onToast({ type: "error", message: "该用户已经在权限列表中" });
      return;
    }
    setRows((current) => [...current, {
      userId: draft.userId!,
      userName: draft.userName,
      role: draft.role,
      kind: "task",
      source: "explicit",
      locked: false,
    }]);
    setDraft({ userId: null, userName: "", role: "viewer" });
  }

  async function save() {
    if (!target || saving) return;
    setSaving(true);
    try {
      await saveSpacePermissions(target, explicitRows.map((row) => ({ userId: row.userId, role: row.role })));
      await load();
      onToast({ type: "success", message: "空间权限已保存" });
    } catch (err) {
      onToast({ type: "error", message: err instanceof Error ? err.message : "保存权限失败" });
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) return <EmptyStateCard compact>仅空间管理员可维护权限。</EmptyStateCard>;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-[1fr_12rem_auto]">
        <FormField label="授权用户">
          <FkFieldInput
            fkKey="work.tasks.permission.user"
            endpoint={WORK_REFERENCE_OPTIONS_ENDPOINT}
            value={draft.userId ? String(draft.userId) : ""}
            displayValue={draft.userName}
            placeholder="搜索用户"
            onChange={(value, option) => setDraft((current) => ({
              ...current,
              userId: option?.id ?? (value ? current.userId : null),
              userName: option?.name ?? (value ? value : ""),
            }))}
          />
        </FormField>
        <FormField label="权限">
          <OptionPicker
            value={draft.role}
            options={[...WORK_ROLE_OPTIONS]}
            visibleCount={4}
            gridColumnCount={2}
            onChange={(value) => setDraft((current) => ({ ...current, role: normalizeRole(value) }))}
          />
        </FormField>
        <div className="flex items-end">
          <button
            type="button"
            disabled={!draft.userId || saving}
            onClick={addDraft}
            className="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400"
          >
            添加
          </button>
        </div>
      </div>
      <TableScrollFrame className="overflow-y-hidden rounded-lg border border-slate-200">
        <DataTable
          rows={rows}
          columns={columns}
          visibleColumns={["role"]}
          rowKey={(row) => row.userId}
          density="compact"
          loading={loading}
          emptyText="暂无额外授权"
        />
      </TableScrollFrame>
      <div className="flex justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400"
        >
          保存权限
        </button>
      </div>
    </div>
  );
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
