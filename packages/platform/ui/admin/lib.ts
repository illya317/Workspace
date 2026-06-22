import type { ResourceItem, EmployeePerm, Subject, Grant, PermissionState, SubjectType } from "./types";

export const ROLE_META: Record<string, { name: string; color: string }> = {
  access: { name: "访问", color: "emerald" },
  write: { name: "编辑", color: "blue" },
  delete: { name: "删除", color: "red" },
  admin: { name: "管理", color: "purple" },
};

export const ROLE_PRIORITY: Record<string, number> = {
  admin: 4,
  write: 3,
  delete: 2,
  access: 1,
};

export function sourceLabel(source: string): string {
  switch (source) {
    case "direct": return "直接授权";
    case "position": return "岗位继承";
    case "department": return "部门继承";
    case "ancestor": return "父资源继承";
    case "implied": return "高级权限隐含";
    case "implicit": return "默认规则";
    case "child": return "子资源已授权";
    default: return source;
  }
}

/** 返回 targetRoleKey 的所有隐含权限（含自身） */
function impliedRoleKeys(roleKey: string): string[] {
  const normalized = roleKey === "read" ? "access" : roleKey;
  // resolveRoleKeys(roleKey): 拥有哪些角色的用户，自动拥有 roleKey
  if (normalized === "admin") return ["admin"];
  if (normalized === "delete") return ["admin", "delete"];
  if (normalized === "write") return ["admin", "delete", "write"];
  return ["admin", "delete", "write", "access"];
}

export function computePermissionState(
  subject: Subject,
  roleKey: string,
  selectedResource: string | null,
  ancestorResourceKeys: string[],
  directGrants: Grant[],
  positionGrants: Grant[],
  departmentGrants: Grant[],
  implicitGrants: Grant[],
  subjectType: SubjectType,
  childResourceKeys?: string[],
): PermissionState {
  const extra = subject.extra;
  const impliedRoles = impliedRoleKeys(roleKey);

  // 1) Exact match (direct / ancestor)
  const directExact = directGrants.find(
    (g) =>
      g.subjectId === subject.id &&
      (g.resourceKey === selectedResource || ancestorResourceKeys.includes(g.resourceKey)) &&
      g.roleKey === roleKey
  );
  if (directExact) {
    return { has: true, source: directExact.resourceKey === selectedResource ? "direct" : "ancestor" };
  }

  // 2) Exact match (position / department)
  if (subjectType === "user" && extra?.positionIds?.length) {
    const posExact = positionGrants.find(
      (g) =>
        extra.positionIds!.includes(g.subjectId) &&
        (g.resourceKey === selectedResource || ancestorResourceKeys.includes(g.resourceKey)) &&
        g.roleKey === roleKey
    );
    if (posExact) return { has: true, source: "position" };
  }

  if (subjectType === "user" && extra?.departmentIds?.length) {
    const deptExact = departmentGrants.find(
      (g) =>
        extra.departmentIds!.includes(g.subjectId) &&
        (g.resourceKey === selectedResource || ancestorResourceKeys.includes(g.resourceKey)) &&
        g.roleKey === roleKey
    );
    if (deptExact) return { has: true, source: "department" };
  }

  // 3) Role hierarchy implied (higher role implies lower)
  const directImplied = directGrants.find(
    (g) =>
      g.subjectId === subject.id &&
      (g.resourceKey === selectedResource || ancestorResourceKeys.includes(g.resourceKey)) &&
      impliedRoles.includes(g.roleKey)
  );
  if (directImplied) return { has: true, source: "implied" };

  // 4) Role hierarchy implied (position / department)
  if (subjectType === "user" && extra?.positionIds?.length) {
    const posImplied = positionGrants.find(
      (g) =>
        extra.positionIds!.includes(g.subjectId) &&
        (g.resourceKey === selectedResource || ancestorResourceKeys.includes(g.resourceKey)) &&
        impliedRoles.includes(g.roleKey)
    );
    if (posImplied) return { has: true, source: "implied" };
  }

  if (subjectType === "user" && extra?.departmentIds?.length) {
    const deptImplied = departmentGrants.find(
      (g) =>
        extra.departmentIds!.includes(g.subjectId) &&
        (g.resourceKey === selectedResource || ancestorResourceKeys.includes(g.resourceKey)) &&
        impliedRoles.includes(g.roleKey)
    );
    if (deptImplied) return { has: true, source: "implied" };
  }

  // 5) Built-in effective permissions.
  const implicit = implicitGrants.find(
    (g) =>
      g.subjectId === subject.id &&
      g.resourceKey === selectedResource &&
      g.roleKey === roleKey
  );
  if (implicit) return { has: true, source: "implicit" };

  // 6) Child resource has grant → gray check on parent (no parent grant, but children have)
  if (childResourceKeys?.length) {
    const childGrant = directGrants.find(
      (g) => g.subjectId === subject.id && childResourceKeys.includes(g.resourceKey) && g.roleKey === roleKey
    );
    if (childGrant) return { has: true, source: "child" };
    if (subjectType === "user" && extra?.positionIds?.length) {
      const posChild = positionGrants.find(
        (g) => extra.positionIds!.includes(g.subjectId) && childResourceKeys.includes(g.resourceKey) && g.roleKey === roleKey
      );
      if (posChild) return { has: true, source: "child" };
    }
    if (subjectType === "user" && extra?.departmentIds?.length) {
      const deptChild = departmentGrants.find(
        (g) => extra.departmentIds!.includes(g.subjectId) && childResourceKeys.includes(g.resourceKey) && g.roleKey === roleKey
      );
      if (deptChild) return { has: true, source: "child" };
    }
  }

  return { has: false, source: null };
}

export function isTopLevelResource(key: string): boolean {
  return [
    "hr",
    "work",
    "docs",
    "finance",
    "production",
    "administration",
    "library",
    "external",
  ].includes(key);
}

export function flattenTree(resources: ResourceItem[]): ResourceItem[] {
  const result: ResourceItem[] = [];
  for (const r of resources) {
    result.push(r);
    if (r.children && r.children.length > 0) {
      result.push(...flattenTree(r.children));
    }
  }
  return result;
}

/** 检查员工是否对某资源有直接授权（精确匹配，不再检查祖先） */
export function userHasAccess(emp: EmployeePerm, resourceKey: string): boolean {
  return emp.resourceRoles.some(
    (rr) => rr.resource?.key === resourceKey && rr.role?.key === "access",
  );
}

export const HIDDEN_RESOURCE_KEYS = new Set<string>([]);

export function groupByParent(
  resources: ResourceItem[],
): Array<{ parent: ResourceItem; children: ResourceItem[] }> {
  const all = [...resources].sort((a, b) => a.key.localeCompare(b.key));
  const parents = all.filter(
    (r) => !r.key.includes(".") && !HIDDEN_RESOURCE_KEYS.has(r.key),
  );
  return parents.map((parent) => ({
    parent,
    children: all.filter((r) => r.key.startsWith(parent.key + ".")),
  }));
}
