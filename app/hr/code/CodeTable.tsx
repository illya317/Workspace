"use client";

import { isBio, isPharma } from "@/lib/company";
import { EditRow } from "./CodeEditRow";
import CodeRow from "./components/CodeRow";
import PersonListModal from "./components/PersonListModal";
import PositionDeptModal from "./components/PositionDeptModal";

import type { HRUser as User } from "@/app/hr/types";
import type { Employee, CodeItem } from "@/app/hr/code/types";

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
}: CodeTableProps) {
  const bioCodes = sortedCodes.filter((c) => isBio(c.code));
  const pharmaCodes = sortedCodes.filter((c) => isPharma(c.code));
  const bioTotal = bioCodes.reduce(
    (sum, c) => sum + (stats[c.code] || 0),
    0
  );
  const pharmaTotal = pharmaCodes.reduce(
    (sum, c) => sum + (stats[c.code] || 0),
    0
  );
  const grandTotal = sortedCodes.reduce(
    (sum, c) => sum + (stats[c.code] || 0),
    0
  );

  const renderRow = (item: CodeItem) => {
    const isEditing = editRow === item.code;
    const count = stats[item.code] || 0;

    if (isEditing) {
      return (
        <EditRow
          key={item.code}
          item={item}
          editCodeValue={editCodeValue}
          setEditCodeValue={setEditCodeValue}
          editNameValue={editNameValue}
          setEditNameValue={setEditNameValue}
          count={count}
          selectedCode={selectedCode}
          setDetailModal={setDetailModal}
        />
      );
    }

    return (
      <CodeRow
        key={item.code}
        item={item}
        count={count}
        isSelected={selectedCode === item.code}
        onCodeClick={onSelect ? () => onSelect(item.code) : undefined}
        onNameClick={() => {
          if (editMode && user.canEditHR) {
            startEditRow(item);
          } else if (onSelect) {
            onSelect(item.code);
          } else if (type === "position") {
            loadPositionDepts(item);
          } else {
            setDetailModal({
              open: true,
              code: item.code,
              name: item.name,
            });
          }
        }}
        onCountClick={() =>
          setDetailModal({
            open: true,
            code: item.code,
            name: item.name,
          })
        }
      />
    );
  };

  return (
    <>
      <table className="w-full table-fixed text-xs">
        <thead className="border-b bg-gray-50">
          <tr>
            <th
              onClick={() => toggleSort("code")}
              className="w-24 cursor-pointer whitespace-nowrap px-2 py-1.5 text-left font-medium text-gray-600 hover:bg-gray-100 select-none"
            >
              <span className="flex items-center gap-1">
                编号
                {sortField === "code" && (
                  <span className="text-emerald-500">
                    {sortDirection === "asc" ? "↑" : "↓"}
                  </span>
                )}
              </span>
            </th>
            <th
              onClick={() => toggleSort("name")}
              className="cursor-pointer whitespace-nowrap px-2 py-1.5 text-left font-medium text-gray-600 hover:bg-gray-100 select-none"
            >
              <span className="flex items-center gap-1">
                名称
                {sortField === "name" && (
                  <span className="text-emerald-500">
                    {sortDirection === "asc" ? "↑" : "↓"}
                  </span>
                )}
              </span>
            </th>
            <th
              onClick={() => toggleSort("count")}
              className="w-16 cursor-pointer whitespace-nowrap px-2 py-1.5 text-right font-medium text-gray-600 hover:bg-gray-100 select-none"
            >
              <span className="flex items-center justify-end gap-1">
                人数
                {sortField === "count" && (
                  <span className="text-emerald-500">
                    {sortDirection === "asc" ? "↑" : "↓"}
                  </span>
                )}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {bioCodes.length > 0 && (
            <>
              <tr className="bg-gray-100">
                <td
                  colSpan={3}
                  className="px-2 py-1 font-medium text-gray-600"
                >
                  常规体系
                </td>
              </tr>
              {bioCodes.map(renderRow)}
              <tr className="border-b bg-gray-50">
                <td className="px-2 py-1.5" />
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-medium text-gray-600">
                  小计
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right">
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    {bioTotal}
                  </span>
                </td>
              </tr>
            </>
          )}
          {pharmaCodes.length > 0 && (
            <>
              <tr className="bg-gray-100">
                <td
                  colSpan={3}
                  className="px-2 py-1 font-medium text-gray-600"
                >
                  GMP
                </td>
              </tr>
              {pharmaCodes.map(renderRow)}
              <tr className="border-b bg-gray-50">
                <td className="px-2 py-1.5" />
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-medium text-gray-600">
                  小计
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right">
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    {pharmaTotal}
                  </span>
                </td>
              </tr>
            </>
          )}
          <tr className="bg-gray-100">
            <td className="px-2 py-1.5" />
            <td className="whitespace-nowrap px-2 py-1.5 text-right font-bold text-gray-700">
              合计
            </td>
            <td className="whitespace-nowrap px-2 py-1.5 text-right">
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                {grandTotal}
              </span>
            </td>
          </tr>
          {editMode && user.canEditHR && (
            <tr className="border-b last:border-0 bg-gray-50">
              <td className="whitespace-nowrap px-2 py-1.5">
                <input
                  type="text"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAdd();
                  }}
                  placeholder="如001"
                  className="w-full rounded border border-gray-300 px-1 py-0.5 text-xs focus:border-emerald-400 focus:outline-none"
                />
              </td>
              <td className="whitespace-nowrap px-2 py-1.5">
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAdd();
                    }}
                    placeholder="名称"
                    className="w-full rounded border border-gray-300 px-1 py-0.5 text-xs focus:border-emerald-400 focus:outline-none"
                  />
                  <button
                    onClick={handleAdd}
                    className="rounded-md bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-700"
                  >
                    添加
                  </button>
                </div>
              </td>
              <td className="whitespace-nowrap px-2 py-1.5 text-gray-400">
                -
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <PersonListModal
        detailModal={detailModal}
        setDetailModal={setDetailModal}
        getDetailList={getDetailList}
      />

      <PositionDeptModal
        positionDeptModal={positionDeptModal}
        setPositionDeptModal={setPositionDeptModal}
      />
    </>
  );
}
