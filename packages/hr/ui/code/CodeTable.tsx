"use client";

import { workspacePath } from "@workspace/core/routing";
import type { KeyboardEvent } from "react";
import { useEffect, useState } from "react";
import { PageSurface, createPageBody, type DataSurfaceColumnSpec, type DataSurfaceCommandSpec } from "@workspace/core/ui";
import PersonListModal from "./components/PersonListModal";
import PositionDeptModal from "./components/PositionDeptModal";
import { hrCanEdit, type HRUser as User } from "@workspace/hr/types";
import type { Employee, CodeItem } from "@workspace/hr/types";
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
  detailModal: {
    open: boolean;
    code: string;
    name: string;
  } | null;
  setDetailModal: (v: {
    open: boolean;
    code: string;
    name: string;
  } | null) => void;
  positionDeptModal: {
    open: boolean;
    code: string;
    name: string;
    departments: string[];
  } | null;
  setPositionDeptModal: (v: {
    open: boolean;
    code: string;
    name: string;
    departments: string[];
  } | null) => void;
  getDetailList: (item: CodeItem) => Employee[];
  loadPositionDepts: (item: CodeItem) => void;
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
  detailModal,
  setDetailModal,
  positionDeptModal,
  setPositionDeptModal,
  getDetailList,
  loadPositionDepts,
  user,
  type,
  actions,
  loading,
  emptyText
}: CodeTableProps) {
  const [pharmaCodesSet, setPharmaCodesSet] = useState<Set<string>>(new Set());
  useEffect(() => {
    fetch(workspacePath("/api/modules/hr/roster/companies?active=1")).then(r => r.json()).then(data => {
      const gmpCodes = new Set<string>((data.companies || []).filter((c: {
        managementGroup: string;
      }) => c.managementGroup === "GMP").map((c: {
        code: string;
      }) => c.code));
      setPharmaCodesSet(gmpCodes);
    });
  }, []);
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
    label: "常规体系"
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
    label: "GMP"
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
  function openDetail(item: CodeItem) {
    setDetailModal({
      open: true,
      code: item.code,
      name: item.name
    });
  }
  function handleNameClick(item: CodeItem) {
    if (editMode && hrCanEdit(user)) {
      startEditRow(item);
    } else if (onSelect) {
      onSelect(item.code);
    } else if (type === "position") {
      loadPositionDepts(item);
    } else {
      openDetail(item);
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
      return <span className={onSelect ? "cursor-pointer hover:text-emerald-600" : ""} onClick={() => onSelect?.(row.item.code)}>
            {editRow === row.item.code ? editCodeValue : row.item.code}
          </span>;
    }
  }, {
    key: "name",
    label: `名称${sortField === "name" ? sortDirection === "asc" ? " ↑" : " ↓" : ""}`,
    required: true,
    onHeaderClick: () => toggleSort("name"),


    cell: row => {
      if (row.kind === "group") return <span className="font-medium text-slate-600">{row.label}</span>;
      if (row.kind === "summary") return <span className="font-medium text-slate-700">{row.label}</span>;
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
      return <span className="cursor-pointer hover:text-emerald-600" onClick={() => handleNameClick(row.item)}>
            {row.item.name || "-"}
          </span>;
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
        return {
          kind: "action",
          action: {
            key: "add",
            label: "添加",
            variant: "primary",
            size: "sm",

            onClick: handleAdd,
          },
        };
      }
      if (row.kind !== "code") return null;
      const count = stats[row.item.code] || 0;
      return {
        kind: "action",
        action: {
          key: "detail-count",
          label: count,
          variant: "secondary",
          size: "sm",

          onClick: () => openDetail(row.item),
        },
      };
    }
  }];
  return <>
      <PageSurface kind="standard"
        embedded
        body={createPageBody([{
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

              rowState: row => {
                if (row.kind === "group" || row.kind === "summary") return "muted";
                if (row.kind === "add") return "muted";
                return selectedCode === row.item.code ? "selected" : "normal";
              },
            } },
          }], { layout: "single" })}
      />

      <PersonListModal detailModal={detailModal} setDetailModal={setDetailModal} getDetailList={getDetailList} />

      <PositionDeptModal positionDeptModal={positionDeptModal} setPositionDeptModal={setPositionDeptModal} />
    </>;
}
