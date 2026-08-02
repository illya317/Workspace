import type { ResourceItem, EmployeePerm } from "./types";
import { actionImplies, isPermissionActionKey } from "@workspace/platform/permission-actions";

export function sourceLabel(source: string): string {
  switch (source) {
    case "direct": return "直接授权";
    case "position": return "岗位继承";
    case "department": return "部门继承";
    case "ancestor": return "父资源继承";
    case "implied": return "高级权限隐含";
    case "system":
    case "implicit": return "系统授予";
    case "entry": return "派生入口";
    case "child": return "下级入口";
    default: return source;
  }
}

export type PermissionSourceTone = "gray" | "green" | "orange" | "red" | "yellow" | "blue";

export function sourceTone(source: string | null | undefined): PermissionSourceTone {
  if (source === "direct") return "green";
  if (source === "system" || source === "implicit") return "orange";
  if (source === "position" || source === "department") return "red";
  if (source === "ancestor" || source === "implied") return "blue";
  if (source === "entry" || source === "child") return "yellow";
  return "gray";
}

export function sourceTooltip(source: string | null | undefined): string {
  if (!source) return "未授权";
  if (source === "ancestor") return "上层授予";
  if (source === "implied") return "高级隐含";
  if (source === "entry") return "派生入口";
  if (source === "child") return "下级入口";
  return sourceLabel(source);
}

export function isTopLevelResource(key: string): boolean {
  return [
    "hr",
    "work",
    "docs",
    "finance",
    "production",
    "administration",
    "capitalSecurities",
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
    (rr) => rr.resource?.key === resourceKey && Boolean(rr.role?.key && isPermissionActionKey(rr.role.key) && actionImplies(rr.role.key, "entry")),
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
