import type { ResourceItem, EmployeePerm } from "./types";

export function isTopLevelResource(key: string): boolean {
  return ["system", "people", "work", "docs"].includes(key);
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
    (rr) => rr.resource?.key === resourceKey && rr.role?.key === "access"
  );
}

const HIDDEN_RESOURCE_KEYS = new Set(["field", "finance"]);

export function groupByParent(
  resources: ResourceItem[]
): Array<{ parent: ResourceItem; children: ResourceItem[] }> {
  const all = [...resources].sort((a, b) => a.key.localeCompare(b.key));
  const parents = all.filter((r) => !r.key.includes(".") && !HIDDEN_RESOURCE_KEYS.has(r.key));
  return parents.map((parent) => ({
    parent,
    children: all.filter((r) => r.key.startsWith(parent.key + ".")),
  }));
}
