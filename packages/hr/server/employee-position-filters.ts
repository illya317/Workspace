import { formatDepartmentPath, type DepartmentPathNode } from "@workspace/hr/utils/department-path";

export type EmployeePositionFilterItem = {
  department?: DepartmentPathNode | null;
  position?: { name: string; department?: DepartmentPathNode | null } | null;
};

function departmentMatches(department: EmployeePositionFilterItem["department"], value: string) {
  if (!department) return false;
  return department.name === value || formatDepartmentPath(department) === value;
}

export function employeePositionMatches(
  positions: EmployeePositionFilterItem[],
  filters: { department?: string; position?: string },
) {
  return positions.some((item) => {
    const matchesDepartment = !filters.department
      || departmentMatches(item.department, filters.department)
      || departmentMatches(item.position?.department ?? null, filters.department);
    const matchesPosition = !filters.position || item.position?.name === filters.position;
    return matchesDepartment && matchesPosition;
  });
}

export const employeePositionFilterInclude = {
  department: { include: { parent: { include: { parent: true } } } },
  position: { include: { department: { include: { parent: { include: { parent: true } } } } } },
} as const;
