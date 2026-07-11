export type HrPerformanceAudienceType = "personal" | "department" | "project";

export type HrPerformanceAudienceSelectionCatalog = {
  employees: Array<{
    id: number;
    positions: Array<{ departmentId: number | null; isPrimary: boolean }>;
  }>;
  departments: Array<{ id: number; parentId: number | null }>;
  projects: Array<{
    id: number;
    employees: Array<{ employeeId: number; startDate: string | null; endDate: string | null }>;
  }>;
};

export function selectHrPerformanceAudience(input: {
  audienceType: HrPerformanceAudienceType | null;
  audienceId: number | null;
  catalog: HrPerformanceAudienceSelectionCatalog;
  today: string;
}): { ok: true; employeeIds: Set<number> | null } | { ok: false } {
  if (!input.audienceId) return { ok: true, employeeIds: null };
  if (!input.audienceType) return { ok: false };

  if (input.audienceType === "personal") {
    const exists = input.catalog.employees.some((employee) => employee.id === input.audienceId);
    return exists ? { ok: true, employeeIds: new Set([input.audienceId]) } : { ok: false };
  }
  if (input.audienceType === "department") {
    if (!input.catalog.departments.some((department) => department.id === input.audienceId)) return { ok: false };
    const departmentIds = collectDepartmentDescendantIds(input.catalog.departments, input.audienceId);
    return {
      ok: true,
      employeeIds: new Set(input.catalog.employees.flatMap((employee) => {
        const primary = employee.positions.find((position) => position.isPrimary) ?? employee.positions[0] ?? null;
        return primary?.departmentId && departmentIds.has(primary.departmentId) ? [employee.id] : [];
      })),
    };
  }

  const project = input.catalog.projects.find((item) => item.id === input.audienceId);
  if (!project) return { ok: false };
  return {
    ok: true,
    employeeIds: new Set(project.employees.flatMap((membership) => (
      membershipIsActive(membership, input.today) ? [membership.employeeId] : []
    ))),
  };
}

function collectDepartmentDescendantIds(
  departments: Array<{ id: number; parentId: number | null }>,
  rootId: number,
) {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const department of departments) {
      if (department.parentId && ids.has(department.parentId) && !ids.has(department.id)) {
        ids.add(department.id);
        changed = true;
      }
    }
  }
  return ids;
}

function membershipIsActive(
  membership: { startDate: string | null; endDate: string | null },
  today: string,
) {
  return (!membership.startDate || membership.startDate <= today)
    && (!membership.endDate || membership.endDate >= today);
}
