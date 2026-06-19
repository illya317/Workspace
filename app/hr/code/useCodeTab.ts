"use client";

import { useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import { useToast } from "@workspace/core/hooks";
import { useCodeData } from "./hooks/useCodeData";
import { useCodeTable } from "./hooks/useCodeTable";
import { useCodeEdit } from "./hooks/useCodeEdit";
import {
  getDetailList as getDetailListFromEmployees,
} from "./useCodeHelpers";

import type { HRUser as User } from "../types";
import type { Employee, CodeItem } from "./types";

export type { Employee, CodeItem };

export function useCodeTab({
  user,
  type,
  apiPath,
  companyCode,
  selectedCompany,
  departmentCode,
}: {
  user: User;
  type: "department" | "position";
  apiPath: string;
  companyCode: string;
  selectedCompany: string;
  departmentCode?: string;
}) {
  const { toast, showToast, closeToast } = useToast();
  const { codes, setCodes, employees, stats, loading } = useCodeData({
    type,
    apiPath,
    companyCode,
    selectedCompany,
    departmentCode,
  });
  const { sortField, sortDirection, toggleSort, sortedCodes } = useCodeTable(
    codes,
    stats
  );
  const edit = useCodeEdit({
    user,
    type,
    apiPath,
    companyCode,
    departmentCode,
    codes,
    setCodes,
    showToast,
  });

  const [detailModal, setDetailModal] = useState<{
    open: boolean;
    code: string;
    name: string;
  } | null>(null);
  const [positionDeptModal, setPositionDeptModal] = useState<{
    open: boolean;
    code: string;
    name: string;
    departments: string[];
  } | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const entityType = type === "department" ? "Department" : "Position";

  function getDetailListWrapper(codeItem: CodeItem): Employee[] {
    return getDetailListFromEmployees(employees, type, codeItem);
  }

  async function loadPositionDepts(item: CodeItem) {
    if (type !== "position") {
      setDetailModal({ open: true, code: item.code, name: item.name });
      return;
    }
    const res = await fetch(
      workspacePath(`/api/admin/position-codes?positionCode=${encodeURIComponent(item.code)}`)
    );
    if (res.ok) {
      const data = await res.json();
      setPositionDeptModal({
        open: true,
        code: item.code,
        name: item.name,
        departments: data.departments || [],
      });
    }
  }

  return {
    loading,
    toast,
    closeToast,
    sortField,
    sortDirection,
    toggleSort,
    sortedCodes,
    stats,
    ...edit,
    detailModal,
    setDetailModal,
    positionDeptModal,
    setPositionDeptModal,
    showHistory,
    setShowHistory,
    entityType,
    getDetailList: getDetailListWrapper,
    loadPositionDepts,
  };
}
