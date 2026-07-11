export interface DepartmentPathNode {
  code?: string | null;
  name?: string | null;
  parent?: DepartmentPathNode | null;
}

export function formatDepartmentPath(department: DepartmentPathNode | null | undefined) {
  if (!department) return "";
  const names: string[] = [];
  let current: DepartmentPathNode | null | undefined = department;
  let guard = 0;
  while (current && guard < 10) {
    if (current.name) names.unshift(current.name);
    current = current.parent;
    guard += 1;
  }
  return names.join(" / ");
}

export function formatDepartmentCodePath(department: DepartmentPathNode | null | undefined) {
  if (!department) return "";
  const path = formatDepartmentPath(department);
  return department.code && path ? `${department.code} ${path}` : path || department.code || "";
}
