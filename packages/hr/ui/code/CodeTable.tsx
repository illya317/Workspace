"use client";

import { workspacePath } from "@workspace/core/routing";
import type { KeyboardEvent } from "react";
import { useEffect, useState } from "react";
import { BodySurface, createPageBody, type DataSurfaceColumnSpec, type DataSurfaceCommandSpec, type DataSurfaceRowActionSpec } from "@workspace/core/ui";
import { hrCanEdit, type HRUser as User } from "@workspace/hr/types";
import type { CodeItem } from "@workspace/hr/types";
import { useTenantConfig } from "@workspace/platform/ui/tenant-config";
interface CodeTableProps {
  sortedCodes: CodeItem[];
  stats: Record<string, number>;
  sortField: "code" | "name" | "count";
  sortDirection: "asc" | "desc";
  toggleSort: (field: "code" | "name" | "count") => void;
  editMode: boolean;
  editRow: string | null;
  editCodeValue: string;
  setEditCodeValue: (v: string) => void;
  editNameValue: string;
  setEditNameValue: (v: string) => void;
  newCode: string;
  setNewCode: (v: string) => void;
  newName: string;
  setNewName: (v: string) => void;
  startEditRow: (item: CodeItem) => void;
  handleAdd: () => void;
  onSelect?: (code: string) => void;
  selectedCode?: string;
  positionDepartments: {
    code: string;
    name: string;
    departments: string[];
    loading: boolean;
    error?: string;
  } | null;
  setPositionDepartments: (v: {
    code: string;
    name: string;
    departments: string[];
    loading: boolean;
    error?: string;
  } | null) => void;
  loadPositionDepts: (item: CodeItem) => Promise<void>;
  user: User;
  type: "department" | "position";
  framed?: boolean;
  title?: string;
  actions?: DataSurfaceCommandSpec[];
  loading?: boolean;
  emptyText?: string;
  bodyClassName?: string;
}
type CodeDisplayRow = {
  kind: "group";
  id: string;
  label: string;
} | {
  kind: "code";
  id: string;
  item: CodeItem;
} | {
  kind: "summary";
  id: string;
  label: string;
  total: number;
  grand?: boolean;
} | {
  kind: "add";
  id: string;
};
export default function CodeTable({
  sortedCodes,
  stats,
  sortField,
  sortDirection,
  toggleSort,
  editMode,
  editRow,
  editCodeValue,
  setEditCodeValue,
  editNameValue,
  setEditNameValue,
  newCode,
  setNewCode,
  newName,
  setNewName,
  startEditRow,
  handleAdd,
  onSelect,
  selectedCode,
  positionDepartments,
  setPositionDepartments,
  loadPositionDepts,
  user,
  type,
  actions,
  loading,
  emptyText
}: CodeTableProps) {
  const managementGroups = useTenantConfig().organization.managementGroups;
  const [pharmaCodesSet, setPharmaCodesSet] = useState<Set<string>>(new Set());
  useEffect(() => {
    fetch(workspacePath("/api/modules/hr/roster/companies?active=1")).then(r => r.json()).then(data => {
      const gmpCodes = new Set<string>((data.companies || []).filter((c: {
        managementGroup: string;
      }) => c.managementGroup === managementGroups.regulated).map((c: {
        code: string;
      }) => c.code));
      setPharmaCodesSet(gmpCodes);
    });
  }, [managementGroups.regulated]);
  const isPharma = (code: string) => pharmaCodesSet.has(code.slice(0, 2));
  const isBio = (code: string) => !isPharma(code);
  const bioCodes = sortedCodes.filter(c => isBio(c.code));
  const pharmaCodes = sortedCodes.filter(c => isPharma(c.code));
  const bioTotal = bioCodes.reduce((sum, c) => sum + (stats[c.code] || 0), 0);
  const pharmaTotal = pharmaCodes.reduce((sum, c) => sum + (stats[c.code] || 0), 0);
  const grandTotal = sortedCodes.reduce((sum, c) => sum + (stats[c.code] || 0), 0);
  const rows: CodeDisplayRow[] = [...(bioCodes.length > 0 ? [{
    kind: "group" as const,
    id: "group-bio",
    label: managementGroups.default
  }, ...bioCodes.map(item => ({
    kind: "code" as const,
    id: `code-${item.code}`,
    item
  })), {
    kind: "summary" as const,
    id: "summary-bio",
    label: "小计",
    total: bioTotal
  }] : []), ...(pharmaCodes.length > 0 ? [{
    kind: "group" as const,
    id: "group-pharma",
    label: managementGroups.regulated
  }, ...pharmaCodes.map(item => ({
    kind: "code" as const,
    id: `code-${item.code}`,
    item
  })), {
    kind: "summary" as const,
    id: "summary-pharma",
    label: "小计",
    total: pharmaTotal
  }] : []), {
    kind: "summary",
    id: "summary-grand",
    label: "合计",
    total: grandTotal,
    grand: true
  }, ...(editMode && hrCanEdit(user) ? [{
    kind: "add" as const,
    id: "add-row"
  }] : [])];
  function handleNameClick(item: CodeItem) {
    if (editMode && hrCanEdit(user)) {
      startEditRow(item);
    } else if (onSelect) {
      onSelect(item.code);
    } else if (type === "position") {
      if (positionDepartments?.code === item.code) {
        setPositionDepartments(null);
      } else {
        void loadPositionDepts(item);
      }
    }
  }
  const columns: DataSurfaceColumnSpec<CodeDisplayRow>[] = [{
    key: "code",
    label: `编号${sortField === "code" ? sortDirection === "asc" ? " ↑" : " ↓" : ""}`,
    required: true,
    onHeaderClick: () => toggleSort("code"),
    width: "xs",

    cell: row => {
      if (row.kind === "add") {
        return {
          kind: "input",
          spec: { valueType: "string", control: "text" },
          value: newCode,
          onChange: (value) => setNewCode(String(value ?? "")),
          onKeyDown: (event: KeyboardEvent) => {
            if (event.key === "Enter") handleAdd();
          },
          placeholder: "如001",
        };
      }
      if (row.kind !== "code") return null;
      if (editRow === row.item.code) {
        return {
          kind: "input",
          spec: { valueType: "string", control: "text" },
          value: editCodeValue,
          onChange: (value) => setEditCodeValue(String(value ?? "")),
        };
      }
      return { kind: "text", value: editRow === row.item.code ? editCodeValue : row.item.code, font: "mono" };
    }
  }, {
    key: "name",
    label: `名称${sortField === "name" ? sortDirection === "asc" ? " ↑" : " ↓" : ""}`,
    required: true,
    onHeaderClick: () => toggleSort("name"),


    cell: row => {
      if (row.kind === "group") return { kind: "text", value: row.label, tone: "muted", emphasis: "medium" };
      if (row.kind === "summary") return { kind: "text", value: row.label, emphasis: "medium" };
      if (row.kind === "add") {
        return {
          kind: "input",
          spec: { valueType: "string", control: "text" },
          value: newName,
          onChange: (value) => setNewName(String(value ?? "")),
          onKeyDown: (event: KeyboardEvent) => {
            if (event.key === "Enter") handleAdd();
          },
          placeholder: "名称",
        };
      }
      if (editRow === row.item.code) {
        return {
          kind: "input",
          spec: { valueType: "string", control: "text" },
          value: editNameValue,
          onChange: (value) => setEditNameValue(String(value ?? "")),
        };
      }
      return { kind: "text", value: row.item.name || "-" };
    }
  }, {
    key: "count",
    label: `人数${sortField === "count" ? sortDirection === "asc" ? " ↑" : " ↓" : ""}`,
    required: true,
    onHeaderClick: () => toggleSort("count"),
    align: "right",

    cell: row => {
      if (row.kind === "summary") {
        return {
          kind: "badge",
          label: row.total,
          tone: "emerald",

        };
      }
      if (row.kind === "add") {
        return null;
      }
      if (row.kind !== "code") return null;
      return {
        kind: "badge",
        label: stats[row.item.code] || 0,
        tone: "slate",
      };
    }
  }];
  return <>
      <BodySurface {...createPageBody([{
            key: "code-table",
            body: { kind: "data", data: {
              kind: "table",
              actions,
              loading,
              emptyText,
              rows,
              columns,
              visibleColumns: ["code", "name", "count"],
              presentation: { density: "compact" },

              rowKey: row => row.id,
              expandedRowKey: positionDepartments ? `code-${positionDepartments.code}` : null,
              expandedRow: (row) => {
                const detail = positionDepartments;
                if (!detail || row.kind !== "code" || row.item.code !== detail.code) return null;
                if (detail.loading) return { kind: "text", value: "正在加载关联部门…", tone: "muted" };
                if (detail.error) return { kind: "empty", content: detail.error };
                return {
                  kind: "data",
                  data: {
                    kind: "table",
                    rows: detail.departments.map((department, index) => ({ id: `${row.item.code}-${index}`, department })),
                    columns: [{ key: "department", label: `${detail.name} · 所属部门`, required: true, cell: (item) => item.department }],
                    visibleColumns: ["department"],
                    rowKey: (item) => item.id,
                    emptyText: "暂无关联部门",
                    presentation: { density: "compact", header: "plain", rowHover: "none" },
                  },
                };
              },
              onRowClick: (row) => {
                if (row.kind === "code" && !editMode) handleNameClick(row.item);
              },
              rowActions: (row): DataSurfaceRowActionSpec[] => {
                if (editMode && hrCanEdit(user) && row.kind === "add") {
                  return [{ key: "add-code", label: "添加", kind: "add", onClick: handleAdd }];
                }
                if (!editMode && !onSelect && row.kind === "code") {
                  return [{ key: `view-code-${row.item.code}`, label: "查看详情", kind: "view", onClick: () => handleNameClick(row.item) }];
                }
                return [];
              },

              rowState: row => {
                if (row.kind === "group" || row.kind === "summary") return "muted";
                if (row.kind === "add") return "muted";
                return selectedCode === row.item.code || positionDepartments?.code === row.item.code ? "selected" : "normal";
              },
            } },
          }], { layout: "stack" })} />
    </>;
}
