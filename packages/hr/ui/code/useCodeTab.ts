"use client";

import { useEffect, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import { useFeedback } from "@workspace/core/ui";
import { useCodeData } from "./hooks/useCodeData";
import { useCodeTable } from "./hooks/useCodeTable";
import { useCodeEdit } from "./hooks/useCodeEdit";
import type { HRUser as User } from "@workspace/hr/types";
import type { CodeItem } from "@workspace/hr/types";

export type { CodeItem };

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
  const feedback = useFeedback();
  const { codes, setCodes, stats, loading } = useCodeData({
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
    showToast: feedback.notify,
  });

  const [positionDepartments, setPositionDepartments] = useState<{
    code: string;
    name: string;
    departments: string[];
    loading: boolean;
    error?: string;
  } | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const entityType = type === "department" ? "Department" : "Position";

  useEffect(() => {
    setPositionDepartments(null);
  }, [companyCode, departmentCode]);

  async function loadPositionDepts(item: CodeItem) {
    if (type !== "position") return;
    setPositionDepartments({ code: item.code, name: item.name, departments: [], loading: true });
    try {
      const res = await fetch(
        workspacePath(`/api/modules/hr/roster/position-codes?positionCode=${encodeURIComponent(item.code)}`)
      );
      if (!res.ok) throw new Error(`岗位关联部门加载失败（${res.status}）`);
      const data = await res.json();
      setPositionDepartments({
        code: item.code,
        name: item.name,
        departments: data.departments || [],
        loading: false,
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "岗位关联部门加载失败";
      feedback.error(message);
      setPositionDepartments({ code: item.code, name: item.name, departments: [], loading: false, error: message });
    }
  }

  return {
    loading,
    sortField,
    sortDirection,
    toggleSort,
    sortedCodes,
    stats,
    ...edit,
    positionDepartments,
    setPositionDepartments,
    showHistory,
    setShowHistory,
    entityType,
    loadPositionDepts,
  };
}
