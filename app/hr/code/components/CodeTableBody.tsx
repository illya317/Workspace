"use client";

import { EditRow } from "../CodeEditRow";
import CodeRow from "./CodeRow";
import { type HRUser as User, hrCanEdit } from "@/app/hr/types";
import type { CodeItem } from "../types";

interface CodeTableBodyProps {
  bioCodes: CodeItem[];
  pharmaCodes: CodeItem[];
  bioTotal: number;
  pharmaTotal: number;
  grandTotal: number;
  stats: Record<string, number>;
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
  setDetailModal: (v: { open: boolean; code: string; name: string } | null) => void;
  loadPositionDepts: (item: CodeItem) => void;
  user: User;
  type: "department" | "position";
}

export default function CodeTableBody({
  bioCodes,
  pharmaCodes,
  bioTotal,
  pharmaTotal,
  grandTotal,
  stats,
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
  setDetailModal,
  loadPositionDepts,
  user,
  type,
}: CodeTableBodyProps) {
  function renderRow(item: CodeItem) {
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
          if (editMode && hrCanEdit(user)) {
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
  }

  return (
    <tbody>
      {bioCodes.length > 0 && (
        <>
          <tr className="bg-gray-100">
            <td colSpan={3} className="px-2 py-1 font-medium text-gray-600">
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
            <td colSpan={3} className="px-2 py-1 font-medium text-gray-600">
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
      {editMode && hrCanEdit(user) && (
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
  );
}
