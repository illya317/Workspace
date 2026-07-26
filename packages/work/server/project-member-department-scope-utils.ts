type DepartmentNode = {
  id: number;
  parentId: number | null;
  hierarchyKind: string;
  code: string;
};

export function expandProjectMemberDepartmentScopeIds(input: {
  departments: DepartmentNode[];
  selectedDepartmentIds: number[];
  operatingCommitteeId?: number | null;
}) {
  const activeDepartmentIds = new Set(input.departments.map((department) => department.id));
  const scopeIds = new Set(input.selectedDepartmentIds.filter((id) => activeDepartmentIds.has(id)));
  if (input.operatingCommitteeId && scopeIds.has(input.operatingCommitteeId)) {
    for (const department of input.departments) {
      if (department.hierarchyKind === "M" || department.code === "BSC") scopeIds.add(department.id);
    }
  }
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const department of input.departments) {
      if (!department.parentId || scopeIds.has(department.id) || !scopeIds.has(department.parentId)) continue;
      scopeIds.add(department.id);
      expanded = true;
    }
  }
  return Array.from(scopeIds);
}
