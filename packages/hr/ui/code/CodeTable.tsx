"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useState } from "react";
import { CommandButton, DataTable, TextField, type DataTableColumn } from "@workspace/core/ui";
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
  type
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
  const columns: DataTableColumn<CodeDisplayRow>[] = [{
    key: "code",
    label: `编号${sortField === "code" ? sortDirection === "asc" ? " ↑" : " ↓" : ""}`,
    required: true,
    onHeaderClick: () => toggleSort("code"),
    headerClassName: "w-24 hover:bg-slate-100",
    cellClassName: "px-2 py-1.5 text-xs",
    render: row => {
      if (row.kind === "add") {
        return <TextField value={newCode} onChange={setNewCode} onKeyDown={event => {
          if (event.key === "Enter") handleAdd();
        }} placeholder="如001" />;
      }
      if (row.kind !== "code") return null;
      if (editRow === row.item.code) {
        return <TextField value={editCodeValue} onChange={setEditCodeValue} />;
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
    headerClassName: "hover:bg-slate-100",
    cellClassName: "px-2 py-1.5 text-xs",
    render: row => {
      if (row.kind === "group") return <span className="font-medium text-slate-600">{row.label}</span>;
      if (row.kind === "summary") return <span className="font-medium text-slate-700">{row.label}</span>;
      if (row.kind === "add") {
        return <div className="flex items-center gap-1">
              <TextField value={newName} onChange={setNewName} onKeyDown={event => {
            if (event.key === "Enter") handleAdd();
          }} placeholder="名称" />
              <CommandButton variant="primary" onClick={handleAdd} className="px-3 py-1 text-xs">
                添加
              </CommandButton>
            </div>;
      }
      if (editRow === row.item.code) {
        return <TextField value={editNameValue} onChange={setEditNameValue} />;
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
    headerClassName: "w-16 text-right hover:bg-slate-100",
    cellClassName: "px-2 py-1.5 text-right text-xs",
    render: row => {
      if (row.kind === "summary") {
        return <span className={`${row.grand ? "bg-emerald-100 font-bold" : "bg-emerald-50 font-medium"} rounded-full px-2 py-0.5 text-xs text-emerald-700`}>
              {row.total}
            </span>;
      }
      if (row.kind !== "code") return row.kind === "add" ? "-" : null;
      const count = stats[row.item.code] || 0;
      return <span className="cursor-pointer rounded-full bg-slate-100 px-2 py-0.5 text-xs hover:bg-slate-200" onClick={() => openDetail(row.item)}>
            {count}
          </span>;
    }
  }];
  return <>
      <DataTable rows={rows} columns={columns} visibleColumns={["code", "name", "count"]} density="compact" rowKey={row => row.id} tableClassName="table-fixed text-xs" rowClassName={row => {
      if (row.kind === "group" || row.kind === "summary") return "bg-slate-50 hover:bg-slate-50";
      if (row.kind === "add") return "bg-slate-50";
      return selectedCode === row.item.code ? "bg-emerald-50" : "";
    }} />

      <PersonListModal detailModal={detailModal} setDetailModal={setDetailModal} getDetailList={getDetailList} />

      <PositionDeptModal positionDeptModal={positionDeptModal} setPositionDeptModal={setPositionDeptModal} />
    </>;
}
