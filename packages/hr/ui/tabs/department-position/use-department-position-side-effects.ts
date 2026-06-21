"use client";

import type { Dispatch, SetStateAction } from "react";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { Department, Position, Selection } from "./types";

export function useDepartmentPositionSideEffects({
  archivedDepartments,
  archivedPositions,
  archivedTab,
  departments,
  setCollapsedDepartments,
  setSelection,
  showArchived,
}: {
  archivedDepartments: Department[];
  archivedPositions: Position[];
  archivedTab: "departments" | "positions";
  departments: Department[];
  setCollapsedDepartments: Dispatch<SetStateAction<Set<number>>>;
  setSelection: Dispatch<SetStateAction<Selection>>;
  showArchived: boolean;
}) {
  const initializedCollapsedDepartments = useRef(false);

  useLayoutEffect(() => {
    if (showArchived || initializedCollapsedDepartments.current || departments.length === 0) return;
    initializedCollapsedDepartments.current = true;
    setCollapsedDepartments(new Set(departments.map((department) => department.id)));
  }, [departments, setCollapsedDepartments, showArchived]);

  useEffect(() => {
    if (!showArchived) return;
    setSelection((prev) => {
      if (archivedTab === "departments") {
        if (prev?.type === "department" && archivedDepartments.some((department) => department.id === prev.id)) return prev;
        return archivedDepartments[0] ? { type: "department", id: archivedDepartments[0].id } : null;
      }
      if (prev?.type === "position" && archivedPositions.some((position) => position.id === prev.id)) return prev;
      return archivedPositions[0] ? { type: "position", id: archivedPositions[0].id } : null;
    });
  }, [archivedDepartments, archivedPositions, archivedTab, showArchived, setSelection]);

  function setAllDepartmentsCollapsed(collapsed: boolean) {
    setCollapsedDepartments(collapsed ? new Set(departments.map((department) => department.id)) : new Set());
  }

  return { setAllDepartmentsCollapsed };
}
