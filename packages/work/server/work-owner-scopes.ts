import { prisma } from "@workspace/platform/server/prisma";
import { resolveProjectMemberDepartmentScopeIds } from "./project-member-department-scope";

export async function workOwnerDepartmentScopeIds(targetType?: string | null, targetId?: number | null) {
  if (!targetId) return [];
  if (targetType === "project") {
    const project = await prisma.project.findUnique({
      where: { id: targetId },
      select: {
        projectType: true,
        enablingDepartments: { select: { departmentId: true } },
      },
    });
    if (!project) return [];
    const departmentIds = project.enablingDepartments.map((entry) => entry.departmentId);
    return resolveProjectMemberDepartmentScopeIds({ projectType: project.projectType, departmentIds });
  }
  if (targetType !== "department" && targetType !== "committee") return [];
  const rows = await prisma.department.findMany({
    where: { isArchived: false },
    select: { id: true, parentId: true },
  });
  const childrenByParent = new Map<number, number[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    childrenByParent.set(row.parentId, [...(childrenByParent.get(row.parentId) ?? []), row.id]);
  }
  const ids = [targetId];
  const stack = [...(childrenByParent.get(targetId) ?? [])];
  while (stack.length) {
    const id = stack.shift()!;
    ids.push(id);
    stack.push(...(childrenByParent.get(id) ?? []));
  }
  return ids;
}
