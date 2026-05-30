/**
 * Permission summary for admin user list badges.
 *
 * Normal resources: "模块 全部" (parent grant) or "模块 n/m" (child grants)
 * Color: lowest effective role (conservative display).
 * Role levels: 0=access, 1=write, 2=delete, 3=admin
 */

export type RoleKey = "access" | "write" | "delete" | "admin";

export interface PermissionGrantLike {
  resourceKey: string;
  roleKey: RoleKey | string;
  scopeId?: string | null;
}

export interface ResourceNodeLike {
  key: string;
  name: string;
  scopeTypes?: string | null;
  children?: ResourceNodeLike[];
}

export interface PermissionSummary {
  key: string;
  label: string;
  roleKey: RoleKey;
  source: "parent" | "children";
  coveredChildren: number;
  totalChildren: number;
  parentGrant?: PermissionGrantLike;
  childGrants: Array<{ key: string; label: string; roleKey: RoleKey }>;
  missingChildren: Array<{ key: string; label: string }>;
}

export const ROLE_LEVEL: Record<string, number> = {
  access: 0, write: 1, delete: 2, admin: 3,
};

function maxRole(a: string, b: string): string {
  return (ROLE_LEVEL[a] ?? 0) >= (ROLE_LEVEL[b] ?? 0) ? a : b;
}

function minRole(roles: string[]): string {
  return roles.reduce((min, r) =>
    (ROLE_LEVEL[r] ?? 99) < (ROLE_LEVEL[min] ?? 99) ? r : min,
  );
}

export const ROLE_COLORS: Record<string, string> = {
  admin: "purple", delete: "red", write: "emerald", access: "gray",
};

const SKIP_KEYS = new Set(["system"]);
const LABEL_OVERRIDES: Record<string, string> = { work: "工作汇报" };
const MODULE_ORDER: Record<string, number> = {
  work: 0, people: 1, administration: 2, finance: 3, production: 4,
  external: 5, docs: 6, library: 7, legal: 8,
};

export function summarizeResourcePermissions(
  resourceTree: ResourceNodeLike[],
  grants: PermissionGrantLike[],
): PermissionSummary[] {
  const grantMap = new Map<string, string>();
  for (const g of grants) {
    const existing = grantMap.get(g.resourceKey);
    grantMap.set(g.resourceKey, existing ? maxRole(existing, g.roleKey) : g.roleKey);
  }

  const summaries: PermissionSummary[] = [];

  function walk(nodes: ResourceNodeLike[], isTopLevel: boolean) {
    for (const node of nodes) {
      if (SKIP_KEYS.has(node.key)) continue;

      if (isTopLevel) {
        const nodeLabel = LABEL_OVERRIDES[node.key] || node.name;
        const children = node.children || [];
        const nodeRole = grantMap.get(node.key);
        const childGrants: Array<{ key: string; label: string; roleKey: RoleKey }> = [];
        const missingChildren: Array<{ key: string; label: string }> = [];

        for (const child of children) {
          const cr = grantMap.get(child.key);
          if (cr) childGrants.push({ key: child.key, label: child.name, roleKey: cr as RoleKey });
          else missingChildren.push({ key: child.key, label: child.name });
        }

        if (nodeRole) {
          summaries.push({
            key: node.key, label: nodeLabel,
            roleKey: nodeRole as RoleKey,
            source: "parent",
            coveredChildren: children.length > 0 ? children.length : -1,
            totalChildren: children.length,
            parentGrant: { resourceKey: node.key, roleKey: nodeRole },
            childGrants: children.map((c) => ({
              key: c.key, label: c.name, roleKey: nodeRole as RoleKey,
            })),
            missingChildren: [],
          });
        } else if (childGrants.length > 0) {
          summaries.push({
            key: node.key, label: nodeLabel,
            roleKey: minRole(childGrants.map((c) => c.roleKey)) as RoleKey,
            source: "children",
            coveredChildren: childGrants.length,
            totalChildren: children.length,
            childGrants, missingChildren,
          });
        }
      }

      if (node.children) walk(node.children, false);
    }
  }

  walk(resourceTree, true);
  summaries.sort((a, b) => (MODULE_ORDER[a.key] ?? 99) - (MODULE_ORDER[b.key] ?? 99));
  return summaries;
}

function roleLevel(r: string): number { return ROLE_LEVEL[r] ?? -1; }

/** Tooltip — one item per line */
export function formatSummaryTooltip(s: PermissionSummary): string {
  if (s.source === "parent") {
    const lines = [`父权限-${roleLevel(s.roleKey)}`];
    for (const c of s.childGrants || []) lines.push(`${c.label}-${roleLevel(c.roleKey)}`);
    return lines.join("\n");
  }
  const lines: string[] = [];
  for (const c of s.childGrants || []) lines.push(`${c.label}-${roleLevel(c.roleKey)}`);
  for (const c of s.missingChildren || []) lines.push(`${c.label}=无`);
  return lines.join("\n");
}
