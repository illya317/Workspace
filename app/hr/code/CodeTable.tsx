"use client";

import { useEffect, useState } from "react";
import CodeTableHeader from "./components/CodeTableHeader";
import CodeTableBody from "./components/CodeTableBody";
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
  const [pharmaCodesSet, setPharmaCodesSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/hr/companies?active=1")
      .then((r) => r.json())
      .then((data) => {
        const gmpCodes = new Set<string>(
          (data.companies || [])
            .filter((c: { managementGroup: string }) => c.managementGroup === "GMP")
            .map((c: { code: string }) => c.code)
        );
        setPharmaCodesSet(gmpCodes);
      });
  }, []);

  const isPharma = (code: string) => pharmaCodesSet.has(code.slice(0, 2));
  const isBio = (code: string) => !isPharma(code);

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

  return (
    <>
      <table className="w-full table-fixed text-xs">
        <CodeTableHeader
          sortField={sortField}
          sortDirection={sortDirection}
          toggleSort={toggleSort}
        />
        <CodeTableBody
          bioCodes={bioCodes}
          pharmaCodes={pharmaCodes}
          bioTotal={bioTotal}
          pharmaTotal={pharmaTotal}
          grandTotal={grandTotal}
          stats={stats}
          editMode={editMode}
          editRow={editRow}
          editCodeValue={editCodeValue}
          setEditCodeValue={setEditCodeValue}
          editNameValue={editNameValue}
          setEditNameValue={setEditNameValue}
          newCode={newCode}
          setNewCode={setNewCode}
          newName={newName}
          setNewName={setNewName}
          startEditRow={startEditRow}
          handleAdd={handleAdd}
          onSelect={onSelect}
          selectedCode={selectedCode}
          setDetailModal={setDetailModal}
          loadPositionDepts={loadPositionDepts}
          user={user}
          type={type}
        />
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
