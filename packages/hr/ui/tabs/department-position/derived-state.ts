import { useMemo } from "react";
import { matchText } from "@workspace/core/search";
import type {
  CreatePositionDraft,
  Department,
  DepartmentPositionStats,
  Position,
  Selection,
} from "./types";
import {
  archiveTimestamp,
  departmentPath,
  generatePositionCode,
  plannedHeadcount,
} from "./utils";

export function useDepartmentPositionDerivedState({
  activeOrganizationRootId,
  createPositionDraft,
  departments,
  isOrganizationMode,
  positions,
  search,
  selection,
}: {
  activeOrganizationRootId: number | null;
  createPositionDraft: CreatePositionDraft;
  departments: Department[];
  isOrganizationMode: boolean;
  positions: Position[];
  search: string;
  selection: Selection;
}) {
  const positionNames = useMemo(() => new Set(positions.map((position) => position.name).filter(Boolean)), [positions]);
  const departmentNames = useMemo(() => new Set(departments.map((department) => department.name).filter(Boolean)), [departments]);
  const departmentById = useMemo(() => new Map(departments.map((department) => [department.id, department])), [departments]);
  const positionById = useMemo(() => new Map(positions.map((position) => [position.id, position])), [positions]);
  const createPositionDepartment = createPositionDraft.departmentId ? departmentById.get(createPositionDraft.departmentId) : undefined;
  const createPositionCode = useMemo(
    () => generatePositionCode(createPositionDepartment, positions),
    [createPositionDepartment, positions]
  );

  const positionsByDepartment = useMemo(() => {
    const map = new Map<number, Position[]>();
    for (const position of positions) {
      if (!position.departmentId) continue;
      const list = map.get(position.departmentId) || [];
      list.push(position);
      map.set(position.departmentId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.code.localeCompare(b.code, "zh-CN"));
    }
    return map;
  }, [positions]);

  const departmentStats = useMemo(() => {
    const childrenByParent = new Map<number | null, Department[]>();
    for (const department of departments) {
      const list = childrenByParent.get(department.parentId) || [];
      list.push(department);
      childrenByParent.set(department.parentId, list);
    }
    const statsById = new Map<number, DepartmentPositionStats>();
    const visiting = new Set<number>();

    function calculate(departmentId: number): DepartmentPositionStats {
      const cached = statsById.get(departmentId);
      if (cached) return cached;
      if (visiting.has(departmentId)) {
        return { directPositions: 0, totalPositions: 0, directHeadcount: 0, totalHeadcount: 0 };
      }
      visiting.add(departmentId);
      const directPositions = positionsByDepartment.get(departmentId) || [];
      const stats: DepartmentPositionStats = {
        directPositions: directPositions.length,
        totalPositions: directPositions.length,
        directHeadcount: directPositions.reduce((sum, position) => sum + plannedHeadcount(position), 0),
        totalHeadcount: directPositions.reduce((sum, position) => sum + plannedHeadcount(position), 0),
      };
      for (const child of childrenByParent.get(departmentId) || []) {
        const childStats = calculate(child.id);
        stats.totalPositions += childStats.totalPositions;
        stats.totalHeadcount += childStats.totalHeadcount;
      }
      visiting.delete(departmentId);
      statsById.set(departmentId, stats);
      return stats;
    }

    for (const department of departments) calculate(department.id);
    return statsById;
  }, [departments, positionsByDepartment]);

  const selectedDepartment = selection?.type === "department" ? departmentById.get(selection.id) : undefined;
  const selectedPosition = selection?.type === "position" ? positionById.get(selection.id) : undefined;
  const selectedDepartmentStats = selectedDepartment
    ? departmentStats.get(selectedDepartment.id) ?? { directPositions: 0, totalPositions: 0, directHeadcount: 0, totalHeadcount: 0 }
    : null;
  const rootDepartments = useMemo(() => departments.filter((department) => !department.parentId).sort((a, b) => a.id - b.id), [departments]);

  const visibleDepartmentIds = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.trim();
    const ids = new Set<number>();
    function addAncestors(departmentId: number | null) {
      let current = departmentId ? departmentById.get(departmentId) : undefined;
      const guard = new Set<number>();
      while (current && !guard.has(current.id)) {
        guard.add(current.id);
        ids.add(current.id);
        current = current.parentId ? departmentById.get(current.parentId) : undefined;
      }
    }
    for (const department of departments) {
      const haystack = [department.code, department.name, department.alias, departmentPath(department, departmentById)]
        .filter(Boolean)
        .map(String);
      if (haystack.some((item) => matchText(item, q))) addAncestors(department.id);
    }
    if (!isOrganizationMode) {
      for (const position of positions) {
        const haystack = [
          position.code,
          position.codeRaw,
          position.name,
          position.alias,
          position.positionDescriptionName,
          position.positionDescriptionCode,
          departmentPath(position.departmentId ? departmentById.get(position.departmentId) : undefined, departmentById),
        ].filter(Boolean).map(String);
        if (haystack.some((item) => matchText(item, q))) addAncestors(position.departmentId);
      }
    }
    return ids;
  }, [departmentById, departments, isOrganizationMode, positions, search]);

  const visibleRootDepartments = useMemo(
    () => rootDepartments.filter((department) => !visibleDepartmentIds || visibleDepartmentIds.has(department.id)),
    [rootDepartments, visibleDepartmentIds]
  );
  const activeOrganizationRoot = useMemo(
    () => (activeOrganizationRootId ? visibleRootDepartments.find((department) => department.id === activeOrganizationRootId) || null : null),
    [activeOrganizationRootId, visibleRootDepartments]
  );
  const archivedDepartments = useMemo(() => {
    const keyword = search.trim();
    return departments
      .filter((department) => !keyword || [department.code, department.name, department.alias, department.parentName]
        .filter(Boolean)
        .map(String)
        .some((item) => matchText(item, keyword)))
      .sort((a, b) => archiveTimestamp(b.archivedAt) - archiveTimestamp(a.archivedAt) || b.id - a.id);
  }, [departments, search]);
  const archivedPositions = useMemo(() => {
    const keyword = search.trim();
    return positions
      .filter((position) => !keyword || [
        position.code,
        position.codeRaw,
        position.name,
        position.alias,
        position.departmentName,
        position.positionDescriptionName,
        position.positionDescriptionCode,
      ]
        .filter(Boolean)
        .map(String)
        .some((item) => matchText(item, keyword)))
      .sort((a, b) => archiveTimestamp(b.archivedAt) - archiveTimestamp(a.archivedAt) || b.id - a.id);
  }, [positions, search]);

  return {
    activeOrganizationRoot,
    archivedDepartments,
    archivedPositions,
    createPositionCode,
    createPositionDepartment,
    departmentById,
    departmentNames,
    departmentStats,
    positionById,
    positionNames,
    positionsByDepartment,
    rootDepartments,
    selectedDepartment,
    selectedDepartmentStats,
    selectedPosition,
    visibleDepartmentIds,
    visibleRootDepartments,
  };
}
