import type { Position } from "./types";

export function filterPositionsForLoadedDepartments<T extends Pick<Position, "departmentId">>(
  positions: readonly T[],
  visibleDepartmentIds: ReadonlySet<number>,
  showArchived: boolean,
): T[] {
  if (showArchived) return [...positions];
  return positions.filter((position) => !position.departmentId || visibleDepartmentIds.has(position.departmentId));
}
