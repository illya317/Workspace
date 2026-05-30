/**
 * Permission summary for admin user list badges.
 *
 * Groups a user's grants by top-level resource module, showing:
 *   - "模块 全部" when the parent resource is granted
 *   - "模块 n/m" when only child resources are granted
 *   - role-based color (admin=purple, delete=red, write=green, access=gray)
 */

export type RoleKey = "access" | "write" | "delete" | "admin";

export interface PermissionGrantLike {
  resourceKey: string;
  roleKey: RoleKey | string;
}

export interface ResourceNodeLike {
  key: string;
  name: string;
  children?: ResourceNodeLike[];
}

export interface PermissionSummary {
  /** Top-level resource key (e.g. "finance") */
  key: string;
  /** Display label (e.g. "财务") */
  label: string;
  /** Grant source: parent or children */
  source: "parent" | "children";
  /** Highest role among grants in this group */
  roleKey: RoleKey;
  /** Number of direct children with grants */
  coveredChildren: number;
  /** Total direct children of the parent resource */
  totalChildren: number;
  /** Parent grant (if source === "parent") */
  parentGrant?: PermissionGrantLike;
  /** Child grants with their labels */
  childGrants: Array<{ key: string; label: string; roleKey: RoleKey }>;
  /** Children without any grant */
  missingChildren: Array<{ key: string; label: string }>;
}

const ROLE_RANK: Record<string, number> = {
  admin: 3, delete: 2, write: 1, access: 0,
};

function maxRole(a: string, b: string): string {
  return (ROLE_RANK[a] ?? 0) >= (ROLE_RANK[b] ?? 0) ? a : b;
}

export const ROLE_COLORS: Record<string, string> = {
  admin: "purple",
  delete: "red",
  write: "emerald",
  access: "gray",
};

/** Resources to skip in the regular summary (handled separately) */
const SKIP_KEYS = new Set(["system"]);

/**
 * Compute permission summaries from a resource tree and a flat list of grants.
 * Only top-level resources with at least one grant are returned.
 */
export function summarizeResourcePermissions(
  resourceTree: ResourceNodeLike[],
  grants: PermissionGrantLike[],
): PermissionSummary[] {
  // Build grant lookup: resourceKey → highest roleKey
  const grantMap = new Map<string, string>();
  for (const g of grants) {
    const existing = grantMap.get(g.resourceKey);
    grantMap.set(g.resourceKey, existing ? maxRole(existing, g.roleKey) : g.roleKey);
  }

  const summaries: PermissionSummary[] = [];

  for (const parent of resourceTree) {
    if (SKIP_KEYS.has(parent.key)) continue;

    const children = parent.children ?? [];
    const parentRole = grantMap.get(parent.key);

    // Collect child grants
    const childGrants: Array<{ key: string; label: string; roleKey: RoleKey }> = [];
    const missingChildren: Array<{ key: string; label: string }> = [];

    for (const child of children) {
      const childRole = grantMap.get(child.key);
      if (childRole) {
        childGrants.push({ key: child.key, label: child.name, roleKey: childRole as RoleKey });
      } else {
        missingChildren.push({ key: child.key, label: child.name });
      }
    }

    const hasChildren = children.length > 0;

    if (parentRole) {
      // Parent grant exists → "模块 全部"
      summaries.push({
        key: parent.key,
        label: parent.name,
        source: "parent",
        roleKey: parentRole as RoleKey,
        coveredChildren: hasChildren ? children.length : -1, // -1 means "no children to count"
        totalChildren: children.length,
        parentGrant: { resourceKey: parent.key, roleKey: parentRole },
        childGrants: children.map((c) => ({
          key: c.key, label: c.name, roleKey: parentRole as RoleKey,
        })),
        missingChildren: [],
      });
    } else if (childGrants.length > 0) {
      // Only child grants → "模块 n/m"
      const bestRole = childGrants.reduce(
        (best, c) => maxRole(best, c.roleKey), "access",
      );

      summaries.push({
        key: parent.key,
        label: parent.name,
        source: "children",
        roleKey: bestRole as RoleKey,
        coveredChildren: childGrants.length,
        totalChildren: children.length,
        childGrants,
        missingChildren,
      });
    }
    // If no grant at all for this module, skip it
  }

  return summaries;
}

/** Build a tooltip string from a summary */
export function formatSummaryTooltip(s: PermissionSummary): string {
  const parts: string[] = [s.label];

  if (s.source === "parent") {
    parts.push("：全部");
  } else if (s.totalChildren > 0) {
    const covered = s.childGrants.map((c) => c.label).join("、");
    const missing = s.missingChildren.map((c) => c.label).join("、");
    if (covered) parts.push(`：已授权 ${covered}`);
    if (missing) parts.push(`；缺少 ${missing}`);
  }

  return parts.join("");
}
