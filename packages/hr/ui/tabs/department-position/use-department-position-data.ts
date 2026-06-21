import { useCallback, useEffect, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import type { Department, Position, Selection } from "./types";

export function useDepartmentPositionData({
  isOrganizationMode,
  selection,
  setSelection,
  showArchived,
}: {
  isOrganizationMode: boolean;
  selection: Selection;
  setSelection: (selection: Selection | ((prev: Selection) => Selection)) => void;
  showArchived: boolean;
}) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const archivedQuery = showArchived ? "&archived=1" : "";
      const [deptRes, posRes] = await Promise.all([
        fetch(workspacePath(`/api/modules/hr/departments?pageSize=500${archivedQuery}`)),
        fetch(workspacePath(`/api/modules/hr/positions?pageSize=500${archivedQuery}`)),
      ]);
      if (!deptRes.ok || !posRes.ok) throw new Error("加载失败");
      const [deptData, posData] = await Promise.all([deptRes.json(), posRes.json()]);
      const nextDepartments = deptData.departments || [];
      const nextPositions = posData.positions || [];
      setDepartments(nextDepartments);
      setPositions(nextPositions);
      if (!showArchived) {
        setSelection((prev) => {
          if (prev?.type === "department" && nextDepartments.some((department: Department) => department.id === prev.id)) return prev;
          if (prev?.type === "position" && nextPositions.some((position: Position) => position.id === prev.id)) return prev;
          return nextDepartments[0] ? { type: "department", id: nextDepartments[0].id } : null;
        });
      }
    } catch {
      setError("部门岗位加载失败");
    } finally {
      setLoading(false);
    }
  }, [setSelection, showArchived]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!isOrganizationMode || selection?.type !== "position") return;
    setSelection(departments[0] ? { type: "department", id: departments[0].id } : null);
  }, [departments, isOrganizationMode, selection, setSelection]);

  return {
    departments,
    error,
    loadData,
    loading,
    positions,
  };
}
