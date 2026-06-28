"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBlockSurfaceBlock,
  createMessageBlock,
  createPanelBlock,
  PageSurface,
  type PageSurfaceBlockSpec,
  type SurfaceColumnOptionSpec,
  type DataSurfaceStructuredCellSpec,
  type SurfaceFilterFieldSpec,
} from "@workspace/core/ui";
import { workspacePath } from "@workspace/core/routing";
import { HR_REFERENCE_OPTIONS_ENDPOINT } from "@workspace/hr/ui/fk-keys";
import { buildHRToolbarItems } from "../components/hr-toolbar-items";
import type { RosterSurfaceNavigationProps } from "../roster-surface";
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

type RosterPreviewQuery = {
  keyword?: string;
  filterField?: string;
  filterValue?: string;
};

export default function RosterGeneratedTab({ variant, canEdit, surface }: { variant: RosterGeneratedVariant; canEdit: boolean; surface?: RosterSurfaceNavigationProps }) {
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
  const [pageSize, setPageSize] = useState("50");
  const currentQueryRef = useRef<RosterPreviewQuery>({});

  const columns = useMemo(() => preview?.columns ?? [], [preview]);
  const columnDefs = useMemo<SurfaceColumnOptionSpec[]>(
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

  const loadPreview = useCallback(async (query: RosterPreviewQuery = {}) => {
    setLoading(true);
    setError(null);
    setEditMode(false);
    try {
      const params = new URLSearchParams({
        variant,
        status,
        pageSize,
      });
      const { keyword: currentKeyword = "", filterField: currentFilterField = "", filterValue: currentFilterValue = "" } = query;
      if (currentKeyword.trim()) params.set("keyword", currentKeyword.trim());
      if (currentFilterField && currentFilterValue) {
        params.set("filterField", currentFilterField);
        params.set("filterValue", currentFilterValue);
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
  }, [pageSize, status, variant]);

  useEffect(() => {
    currentQueryRef.current = { keyword, filterField, filterValue };
  }, [filterField, filterValue, keyword]);

  useEffect(() => {
    void loadPreview(currentQueryRef.current);
  }, [loadPreview]);

  function refreshPreview() {
    void loadPreview({ keyword, filterField, filterValue });
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

  const toolbarItems = buildHRToolbarItems({
    search: {
      value: keyword,
      onChange: setKeyword,
      placeholder: "搜索员工、公司、部门、岗位",
      ariaLabel: "搜索员工、公司、部门、岗位",
    },
    filters: {
      configs: [{ key: "status", label: "人员状态", type: "select", options: statusOptions }],
      values: { status },
      onChange: (key, value) => {
        if (key === "status") setStatus(value as RosterGeneratedStatus);
      },
    },
    advancedFilter: {
      fields: filterFields,
      fieldKey: filterField,
      value: filterValue,
      onFieldKeyChange: setFilterField,
      onValueChange: setFilterValue,
      referenceEndpoint: HR_REFERENCE_OPTIONS_ENDPOINT,
    },
    columnToggle: { columns: columnDefs, visible: visibleColumns, onChange: setVisibleColumns },
    refresh: { label: "刷新生成", disabled: loading, onClick: refreshPreview },
    editGroup: {
      editMode,
      onStartEdit: () => setEditMode(true),
      onSave: applyEdits,
      onCancel: () => {
        setGroups(preview?.groups ?? []);
        setEditMode(false);
      },
      onDownload: downloadCsv,
      canEdit,
      saveLabel: "应用到预览",
      editLabel: "编辑预览",
      saving,
    },
    meta: preview ? <span>共 {preview.totalEmployees} 人</span> : null,
    pageSize: {
      value: pageSize,
      options: [
        { value: "50", label: "50条/页" },
        { value: "100", label: "100条/页" },
        { value: "200", label: "200条/页" },
      ],
      onChange: setPageSize,
    },
  });

  const tableBlocks: PageSurfaceBlockSpec[] = loading
    ? [createBlockSurfaceBlock("loading", {
      kind: "message",
      content: "正在生成预览...",
      tone: "muted"
    })]
    : groups.length === 0
      ? [createBlockSurfaceBlock("empty", {
        kind: "empty",
        presentation: "plain",
        content: "暂无花名册数据"
      })]
      : [{
          kind: "data",
          key: "table",
          surface: {
            kind: "structured",
            presentation: { density: "compact", grid: "cells", header: "tinted", stripe: "subtle", cellWrap: "nowrap" },
            rows: buildRosterGeneratedRows({
              columns: visibleTableColumns,
              groups,
              editMode,
              onEmployeeCellChange: updateEmployeeCell,
              onRowCellChange: updateRowCell,
            }),
            cellClassName: "min-w-28 align-top",
            headerCellClassName: "min-w-28 text-left",
          },
        }];

  const blocks: PageSurfaceBlockSpec[] = [
    ...(error ? [createMessageBlock("error", { content: error, tone: "danger" as const })] : []),
    createPanelBlock("preview", {
      className: "overflow-hidden",
      bodyClassName: "overflow-x-auto",
      blocks: tableBlocks,
    }),
  ];

  return (
    <PageSurface
      embedded={!surface}
      kind="list"
      {...surface}
      toolbar={{ items: toolbarItems, onSubmit: refreshPreview }}
      blocks={blocks}
    />
  );
}

function buildRosterGeneratedRows({
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
}): DataSurfaceStructuredCellSpec[][] {
  const headerRow: DataSurfaceStructuredCellSpec[] = columns.map((column) => ({
    header: true,
    content: { kind: "text", value: column.label },
  }));
  const bodyRows = groups.flatMap((group, groupIndex) => (
    group.rows.map((row, rowIndex) => (
      columns.flatMap((column): DataSurfaceStructuredCellSpec[] => {
        const isEmployeeCell = column.scope === "employee";
        if (isEmployeeCell && rowIndex > 0) return [];
        const value = isEmployeeCell ? group.employeeCells[column.key] ?? "" : row.cells[column.key] ?? "";
        return [{
          rowSpan: isEmployeeCell ? group.rows.length : undefined,
          className: [
            isEmployeeCell ? "align-middle font-medium text-slate-800" : "",
          ].filter(Boolean).join(" "),
          content: rosterGeneratedCell(value, editMode, (next) => {
            if (isEmployeeCell) {
              onEmployeeCellChange(groupIndex, column.key, next);
            } else {
              onRowCellChange(groupIndex, rowIndex, column.key, next);
            }
          }),
        }];
      })
    ))
  ));
  return [headerRow, ...bodyRows];
}

function rosterGeneratedCell(value: string, editMode: boolean, onChange: (value: string) => void): DataSurfaceStructuredCellSpec["content"] {
  if (!editMode) return value ? { kind: "text", value } : { kind: "empty" };
  return {
    kind: "input",
    spec: { valueType: "string", control: "text", state: "normal" },
    value,
    onChange: (next) => onChange(String(next ?? "")),
    className: "min-w-24 border-emerald-200 bg-white focus:border-emerald-500 focus:ring-emerald-100",
  };
}

function defaultVisibleColumns(columns: RosterGeneratedColumn[]) {
  return columns.filter((column) => column.required || column.defaultVisible).map((column) => column.key);
}

function mapFilterFields(fields: RosterGeneratedFilterField[]): SurfaceFilterFieldSpec[] {
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
