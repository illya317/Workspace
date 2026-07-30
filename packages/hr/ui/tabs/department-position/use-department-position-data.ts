import { useCallback, useEffect, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import type { Department, OrganizationCodeConfig, Position, Selection } from "./types";
import type { ActionRuntime } from "@workspace/platform/workflow-action-runtime";
import { filterPositionsForLoadedDepartments } from "./department-position-data";

export type HrDepartmentActionRuntimes = {
  create: ActionRuntime;
  update: ActionRuntime;
};

export function useDepartmentPositionData({
  compact = false,
  setSelection,
  showArchived,
}: {
  compact?: boolean;
  setSelection: (selection: Selection | ((prev: Selection) => Selection)) => void;
  showArchived: boolean;
}) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [departmentActionRuntimes, setDepartmentActionRuntimes] = useState<HrDepartmentActionRuntimes | null>(null);
  const [codeConfig, setCodeConfig] = useState<OrganizationCodeConfig | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const archivedQuery = showArchived ? "&archived=1" : "";
      const compactQuery = compact ? "&summary=1" : "";
      const [deptRes, posRes] = await Promise.all([
        fetch(workspacePath(`/api/modules/hr/roster/departments?pageSize=500${archivedQuery}${compactQuery}`)),
        fetch(workspacePath(`/api/modules/hr/roster/positions?pageSize=500${archivedQuery}${compactQuery}`)),
      ]);
      if (!deptRes.ok || !posRes.ok) throw new Error("加载失败");
      const [deptData, posData] = await Promise.all([deptRes.json(), posRes.json()]);
      const nextDepartments = ((deptData.departments || []) as Department[]);
      const visibleDepartmentIds = new Set(nextDepartments.map((department) => department.id));
      const nextPositions = filterPositionsForLoadedDepartments(
        (posData.positions || []) as Position[],
        visibleDepartmentIds,
        showArchived,
      );
      setDepartments(nextDepartments);
      setDepartmentActionRuntimes(deptData.actionRuntimes ?? null);
      setCodeConfig((deptData.codeConfig ?? null) as OrganizationCodeConfig | null);
      setPositions(nextPositions);
      if (!showArchived) {
        setSelection((prev) => {
          if (prev?.type === "department" && nextDepartments.some((department: Department) => department.id === prev.id)) return prev;
          if (prev?.type === "position" && nextPositions.some((position: Position) => position.id === prev.id)) return prev;
          return nextDepartments[0] ? { type: "department", id: nextDepartments[0].id } : null;
        });
      }
    } catch {
      setError("组织岗位加载失败");
    } finally {
      setLoading(false);
    }
  }, [compact, setSelection, showArchived]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    departments,
    departmentActionRuntimes,
    codeConfig,
    error,
    loadData,
    loading,
    positions,
  };
}
