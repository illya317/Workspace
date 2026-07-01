import { prisma } from "@workspace/platform/server/prisma";

export async function getManagerPositionScopeDepartmentIds(departmentId: number) {
  const departments = await prisma.department.findMany({
    where: { isArchived: false },
    select: { id: true, parentId: true },
  });
  const department = departments.find((item) => item.id === departmentId);
  if (!department) return [];

  const byId = new Map(departments.map((item) => [item.id, item]));
  const childrenByParentId = new Map<number, number[]>();
  for (const item of departments) {
    if (!item.parentId) continue;
    const children = childrenByParentId.get(item.parentId) ?? [];
    children.push(item.id);
    childrenByParentId.set(item.parentId, children);
  }

  const scope = new Set<number>([department.id]);
  let parentId = department.parentId;
  while (parentId) {
    scope.add(parentId);
    parentId = byId.get(parentId)?.parentId ?? null;
  }

  const queue = [...(childrenByParentId.get(department.id) ?? [])];
  while (queue.length > 0) {
    const childId = queue.shift();
    if (!childId || scope.has(childId)) continue;
    scope.add(childId);
    queue.push(...(childrenByParentId.get(childId) ?? []));
  }

  return Array.from(scope);
}
