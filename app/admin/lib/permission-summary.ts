/**
 * Permission summary for admin user list badges.
 *
 * Normal resources: "模块 全部" (parent grant) or "模块 n/m" (child grants)
 * Scoped resources:  "部门汇报 3个部门" or "项目汇报 全部项目"
 * Role-based color: admin=purple, delete=red, write=emerald, access=gray
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
  scopeInheritanceMode?: string;
  children?: ResourceNodeLike[];
}

export interface PermissionSummary {
  kind: "normal" | "scoped";
  key: string;
  label: string;
  roleKey: RoleKey;
  // normal
  source?: "parent" | "children";
  coveredChildren?: number;
  totalChildren?: number;
  parentGrant?: PermissionGrantLike;
  childGrants?: Array<{ key: string; label: string; roleKey: RoleKey }>;
  missingChildren?: Array<{ key: string; label: string }>;
  // scoped
  global?: boolean;
  scopeType?: string;
  scopeCount?: number;
  scopeLabel?: string;
  scopes?: Array<{ scopeId: string; targetName: string; roleKey: RoleKey }>;
}

const ROLE_RANK: Record<string, number> = {
  admin: 3, delete: 2, write: 1, access: 0,
};

function maxRole(a: string, b: string): string {
  return (ROLE_RANK[a] ?? 0) >= (ROLE_RANK[b] ?? 0) ? a : b;
}

export const ROLE_COLORS: Record<string, string> = {
  admin: "purple", delete: "red", write: "emerald", access: "gray",
};

const SKIP_KEYS = new Set(["system"]);
const SCOPE_LABELS: Record<string, string> = {
  department: "部门", project: "项目",
};

/**
 * Compute permission summaries from a resource tree and a flat list of grants.
 * Scoped resources (scopeTypes set) are summarized separately with scope counts.
 */
export function summarizeResourcePermissions(
  resourceTree: ResourceNodeLike[],
  grants: PermissionGrantLike[],
): PermissionSummary[] {
  // Grant lookup: resourceKey → { roleKey, scopes }
  const grantMap = new Map<string, { role: string; scopes: Map<string, string> }>();
  for (const g of grants) {
    let entry = grantMap.get(g.resourceKey);
    if (!entry) {
      entry = { role: g.roleKey, scopes: new Map() };
      grantMap.set(g.resourceKey, entry);
    }
    entry.role = maxRole(entry.role, g.roleKey);
    if (g.scopeId) {
      const existing = entry.scopes.get(g.scopeId);
      entry.scopes.set(g.scopeId, existing ? maxRole(existing, g.roleKey) : g.roleKey);
    }
  }

  const summaries: PermissionSummary[] = [];

  // Walk tree: collect scoped summaries from leaf nodes, normal from parents
  function walk(nodes: ResourceNodeLike[], isTopLevel: boolean) {
    for (const node of nodes) {
      if (SKIP_KEYS.has(node.key)) continue;

      const isScoped = !!(node.scopeTypes);
      const nodeGrant = grantMap.get(node.key);

      if (isScoped && nodeGrant) {
        // ── Scoped resource: summarize by scope type ──
        const typeList = (node.scopeTypes || "").split(",").filter(Boolean);
        for (const st of typeList) {
          const prefix = `${st}:`;
          const scopeMap = new Map<string, string>(); // scopeId → roleKey

          // Global grant?
          if (nodeGrant.scopes.has("null") || grantMap.get(node.key)?.scopes.size === 0) {
            // scopeId=null → global
            const globalRole = nodeGrant.role;
            summaries.push({
              kind: "scoped", key: node.key, label: node.name,
              roleKey: globalRole as RoleKey,
              global: true, scopeType: st,
              scopeLabel: `全部${SCOPE_LABELS[st] || st}`,
            });
            continue;
          }

          // Per-scope grants
          for (const [sid, srole] of nodeGrant.scopes) {
            if (sid.startsWith(prefix)) {
              scopeMap.set(sid, srole);
            }
          }

          if (scopeMap.size > 0) {
            const bestRole = [...scopeMap.values()].reduce(
              (best, r) => maxRole(best, r), "access",
            );
            const scopeLabel = `${scopeMap.size}个${SCOPE_LABELS[st] || st}`;
            const scopeEntries = [...scopeMap.entries()].map(([sid, srole]) => ({
              scopeId: sid,
              targetName: sid.slice(sid.lastIndexOf(":") + 1), // ID only; caller resolves names
              roleKey: srole as RoleKey,
            }));

            summaries.push({
              kind: "scoped", key: node.key, label: node.name,
              roleKey: bestRole as RoleKey,
              global: false, scopeType: st,
              scopeCount: scopeMap.size, scopeLabel,
              scopes: scopeEntries,
            });
          }
        }
      } else if (!isScoped && isTopLevel) {
        // ── Normal top-level resource: parent/children logic ──
        const children = (node.children || []).filter(
          (c) => !c.scopeTypes, // skip scoped children (handled above)
        );
        const childGrants: Array<{ key: string; label: string; roleKey: RoleKey }> = [];
        const missingChildren: Array<{ key: string; label: string }> = [];

        if (nodeGrant) {
          // Parent grant → "模块 全部" or just label if no non-scoped children
          const hasNormalChildren = children.length > 0;
          summaries.push({
            kind: "normal", key: node.key, label: node.name,
            roleKey: nodeGrant.role as RoleKey,
            source: "parent",
            coveredChildren: hasNormalChildren ? children.length : -1,
            totalChildren: children.length,
            parentGrant: { resourceKey: node.key, roleKey: nodeGrant.role },
            childGrants: children.map((c) => ({
              key: c.key, label: c.name, roleKey: nodeGrant.role as RoleKey,
            })),
            missingChildren: [],
          });
        } else {
          // Check child grants
          for (const child of children) {
            const cr = grantMap.get(child.key);
            if (cr) {
              childGrants.push({ key: child.key, label: child.name, roleKey: cr.role as RoleKey });
            } else {
              missingChildren.push({ key: child.key, label: child.name });
            }
          }

          if (childGrants.length > 0) {
            const bestRole = childGrants.reduce(
              (best, c) => maxRole(best, c.roleKey), "access",
            );
            summaries.push({
              kind: "normal", key: node.key, label: node.name,
              roleKey: bestRole as RoleKey,
              source: "children",
              coveredChildren: childGrants.length,
              totalChildren: children.length,
              childGrants, missingChildren,
            });
          }
        }
      }

      // Continue walking for scoped nodes under grouping parents
      if (node.children) walk(node.children, false);
    }
  }

  walk(resourceTree, true);
  return summaries;
}

/** Build a tooltip string from a summary */
export function formatSummaryTooltip(s: PermissionSummary): string {
  if (s.kind === "scoped") {
    if (s.global) return `${s.label}：${s.scopeLabel}`;
    const details = (s.scopes || []).map(
      (sc) => `#${sc.targetName}=${roleLabel(sc.roleKey)}`
    ).join("，");
    return `${s.label}（${s.scopeLabel}）：${details}`;
  }

  const parts: string[] = [s.label];
  if (s.source === "parent") {
    parts.push("：全部");
  } else if (s.totalChildren && s.totalChildren > 0) {
    const covered = (s.childGrants || []).map((c) => c.label).join("、");
    const missing = (s.missingChildren || []).map((c) => c.label).join("、");
    if (covered) parts.push(`：已授权 ${covered}`);
    if (missing) parts.push(`；缺少 ${missing}`);
  }
  return parts.join("");
}

function roleLabel(r: string): string {
  return r === "admin" ? "管理" : r === "delete" ? "删除" : r === "write" ? "编辑" : "访问";
}
