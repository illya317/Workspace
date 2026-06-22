"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ColumnToggle,
  CommandToolbar,
  EditToolbar,
  EmptyStateCard,
  FieldValueFilter,
  PanelCard,
  RefreshActionButton,
  SearchInput,
  ToolbarOptionGroup,
  type ColumnDef,
  type FieldValueFilterField,
} from "@workspace/core/ui";
import { workspacePath } from "@workspace/core/routing";
import { HR_REFERENCE_OPTIONS_ENDPOINT } from "@workspace/hr/ui/fk-keys";
import type {
  RosterGeneratedColumn,
  RosterGeneratedFilterField,
  RosterGeneratedGroup,
  RosterGeneratedPreview,
  RosterGeneratedStatus,
  RosterGeneratedVariant,
} from "@workspace/hr/types";

const statusOptions = [
  { value: "all", label: "全部" },
  { value: "active", label: "在职" },
  { value: "inactive", label: "离职" },
];

export default function RosterGeneratedTab({ variant, canEdit }: { variant: RosterGeneratedVariant; canEdit: boolean }) {
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<RosterGeneratedStatus>("all");
  const [preview, setPreview] = useState<RosterGeneratedPreview | null>(null);
  const [groups, setGroups] = useState<RosterGeneratedGroup[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [filterField, setFilterField] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  const columns = useMemo(() => preview?.columns ?? [], [preview]);
  const columnDefs = useMemo<ColumnDef[]>(
    () => columns.map((column) => ({
      key: column.key,
      label: column.label,
      required: column.required,
      defaultVisible: column.defaultVisible,
    })),
    [columns],
  );
  const visibleColumnSet = useMemo(() => new Set(visibleColumns), [visibleColumns]);
  const visibleTableColumns = useMemo(
    () => columns.filter((column) => column.required || visibleColumnSet.has(column.key)),
    [columns, visibleColumnSet],
  );
  const filterFields = useMemo(() => mapFilterFields(preview?.filterFields ?? []), [preview?.filterFields]);

  useEffect(() => {
    void loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, status]);

  async function loadPreview() {
    setLoading(true);
    setError(null);
    setEditMode(false);
    try {
      const params = new URLSearchParams({
        variant,
        status,
        pageSize: "100",
      });
      if (keyword.trim()) params.set("keyword", keyword.trim());
      if (filterField && filterValue) {
        params.set("filterField", filterField);
        params.set("filterValue", filterValue);
      }
      const response = await fetch(workspacePath(`/api/modules/hr/roster/generated/preview?${params.toString()}`));
      const data = await response.json().catch(() => null) as RosterGeneratedPreview | { error?: string } | null;
      if (!response.ok) throw new Error(data && "error" in data && data.error ? data.error : `加载失败 (${response.status})`);
      const nextPreview = data as RosterGeneratedPreview;
      setPreview(nextPreview);
      setGroups(nextPreview.groups);
      setVisibleColumns(defaultVisibleColumns(nextPreview.columns));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function applyEdits() {
    setSaving(true);
    await Promise.resolve();
    setSaving(false);
    setEditMode(false);
  }

  function updateEmployeeCell(groupIndex: number, field: string, value: string) {
    setGroups((current) => current.map((group, index) => (
      index === groupIndex
        ? { ...group, employeeCells: { ...group.employeeCells, [field]: value } }
        : group
    )));
  }

  function updateRowCell(groupIndex: number, rowIndex: number, field: string, value: string) {
    setGroups((current) => current.map((group, index) => {
      if (index !== groupIndex) return group;
      return {
        ...group,
        rows: group.rows.map((row, innerIndex) => (
          innerIndex === rowIndex ? { ...row, cells: { ...row.cells, [field]: value } } : row
        )),
      };
    }));
  }

  function downloadCsv() {
    const csv = buildCsv(visibleTableColumns, groups, false);
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${variant === "management" ? "管理版花名册" : "尽调版花名册"}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <CommandToolbar
        onSubmit={() => void loadPreview()}
        filters={(
          <>
            <SearchInput
              value={keyword}
              onChange={setKeyword}
              placeholder="搜索员工、公司、部门、岗位"
              ariaLabel="搜索员工、公司、部门、岗位"
              size="toolbar"
              className="min-w-64"
            />
            <ToolbarOptionGroup
              value={status}
              options={statusOptions}
              onChange={(value) => setStatus(value as RosterGeneratedStatus)}
              ariaLabel="花名册人员状态"
            />
            <FieldValueFilter
              fields={filterFields}
              valueOptions={{}}
              referenceEndpoint={HR_REFERENCE_OPTIONS_ENDPOINT}
              fieldKey={filterField}
              onFieldKeyChange={setFilterField}
              value={filterValue}
              onValueChange={setFilterValue}
            />
            <ColumnToggle columns={columnDefs} visible={visibleColumns} onChange={setVisibleColumns} />
            <RefreshActionButton
              label="刷新生成"
              onClick={() => void loadPreview()}
              disabled={loading}
            />
          </>
        )}
        editActions={(
          <EditToolbar
            editMode={editMode}
            onStartEdit={() => setEditMode(true)}
            onSave={applyEdits}
            onCancel={() => {
              setGroups(preview?.groups ?? []);
              setEditMode(false);
            }}
            onDownload={downloadCsv}
            canEdit={canEdit}
            downloading={false}
            saveLabel="应用到预览"
            editLabel="编辑预览"
            saving={saving}
          />
        )}
        meta={preview ? (
          <>
            <span>{preview.title}</span>
            <span>{preview.totalEmployees} 人</span>
            <span>{preview.totalRows} 行</span>
            {editMode && <span>编辑仅影响本次预览和导出</span>}
          </>
        ) : null}
      />

      {error && <EmptyStateCard compact className="border-red-100 text-red-600">{error}</EmptyStateCard>}

      <PanelCard className="overflow-hidden" bodyClassName="overflow-x-auto">
        {loading ? (
          <EmptyStateCard compact>正在生成预览...</EmptyStateCard>
        ) : groups.length === 0 ? (
          <EmptyStateCard compact>暂无花名册数据</EmptyStateCard>
        ) : (
          <RosterGeneratedTable
            columns={visibleTableColumns}
            groups={groups}
            editMode={editMode}
            onEmployeeCellChange={updateEmployeeCell}
            onRowCellChange={updateRowCell}
          />
        )}
      </PanelCard>
    </div>
  );
}

function RosterGeneratedTable({
  columns,
  groups,
  editMode,
  onEmployeeCellChange,
  onRowCellChange,
}: {
  columns: RosterGeneratedColumn[];
  groups: RosterGeneratedGroup[];
  editMode: boolean;
  onEmployeeCellChange: (groupIndex: number, field: string, value: string) => void;
  onRowCellChange: (groupIndex: number, rowIndex: number, field: string, value: string) => void;
}) {
  return (
    <table className="min-w-full border-collapse text-sm">
      <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
        <tr>
          {columns.map((column) => (
            <th key={column.key} className="whitespace-nowrap border-b border-r border-slate-200 px-3 py-2 text-left last:border-r-0">
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {groups.map((group, groupIndex) => (
          group.rows.map((row, rowIndex) => (
            <tr key={row.key} className="odd:bg-white even:bg-slate-50/50">
              {columns.map((column) => {
                if (column.scope === "employee") {
                  if (rowIndex > 0) return null;
                  return (
                    <td
                      key={column.key}
                      rowSpan={group.rows.length}
                      className="min-w-28 border-b border-r border-slate-200 bg-white px-3 py-2 align-middle font-medium text-slate-800 last:border-r-0"
                    >
                      <EditableCell
                        value={group.employeeCells[column.key] ?? ""}
                        editMode={editMode}
                        onChange={(value) => onEmployeeCellChange(groupIndex, column.key, value)}
                      />
                    </td>
                  );
                }
                return (
                  <td key={column.key} className="min-w-28 border-b border-r border-slate-200 px-3 py-2 align-top text-slate-700 last:border-r-0">
                    <EditableCell
                      value={row.cells[column.key] ?? ""}
                      editMode={editMode}
                      onChange={(value) => onRowCellChange(groupIndex, rowIndex, column.key, value)}
                    />
                  </td>
                );
              })}
            </tr>
          ))
        ))}
      </tbody>
    </table>
  );
}

function EditableCell({ value, editMode, onChange }: { value: string; editMode: boolean; onChange: (value: string) => void }) {
  if (!editMode) return <span>{value || "-"}</span>;
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-8 w-full min-w-24 rounded-md border border-emerald-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
    />
  );
}

function defaultVisibleColumns(columns: RosterGeneratedColumn[]) {
  return columns.filter((column) => column.required || column.defaultVisible).map((column) => column.key);
}

function mapFilterFields(fields: RosterGeneratedFilterField[]): FieldValueFilterField[] {
  return fields.map((field) => ({
    value: field.key,
    label: field.label,
    valueKind: field.valueKind,
    fkKey: field.fkKey,
    fkReturnField: field.fkReturnField,
    lifecycleScope: field.lifecycleScope,
  }));
}

function buildCsv(columns: RosterGeneratedColumn[], groups: RosterGeneratedGroup[], blankMergedCells: boolean) {
  const lines = [columns.map((column) => escapeCsvCell(column.label)).join(",")];
  for (const group of groups) {
    group.rows.forEach((row, rowIndex) => {
      lines.push(columns.map((column) => {
        if (column.scope === "employee" && blankMergedCells && rowIndex > 0) return "";
        const value = column.scope === "employee" ? group.employeeCells[column.key] : row.cells[column.key];
        return escapeCsvCell(value ?? "");
      }).join(","));
    });
  }
  return lines.join("\n");
}

function escapeCsvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
