/**
 * 从 DB 读取资源最高角色（maxRoleKey），带缓存。
 * 替代 lib/permissions.ts 中硬编码的 RESOURCE_MAX_ROLE。
 */
import { prisma } from "@/lib/prisma";

const ROLE_HIERARCHY: Record<string, number> = {
  access: 0, write: 1, delete: 2, admin: 3,
};

interface ResourceCache {
  key: string;
  maxRoleKey: string;
  parentKey: string | null;
}

let cache: ResourceCache[] | null = null;
let cacheTs = 0;
const CACHE_TTL = 60_000;

async function loadCache(): Promise<ResourceCache[]> {
  if (cache && Date.now() - cacheTs < CACHE_TTL) return cache;
  const resources = await prisma.resource.findMany({
    select: { key: true, maxRoleKey: true, parent: { select: { key: true } } },
  });
  cache = resources.map((r) => ({
    key: r.key,
    maxRoleKey: r.maxRoleKey,
    parentKey: r.parent?.key ?? null,
  }));
  cacheTs = Date.now();
  return cache;
}

/** 沿 DB parent 链取最严格上限 */
export async function getResourceMaxRole(resourceKey: string): Promise<string> {
  const resources = await loadCache();
  const map = new Map(resources.map((r) => [r.key, r]));
  let key: string | null = resourceKey;
  let best = "admin";
  while (key) {
    const r = map.get(key);
    if (r) {
      const cur = ROLE_HIERARCHY[r.maxRoleKey] ?? 3;
      const prev = ROLE_HIERARCHY[best] ?? 3;
      if (cur < prev) best = r.maxRoleKey;
      key = r.parentKey;
    } else {
      // key 不在 DB，回退到点号祖先
      const dot = key.lastIndexOf(".");
      key = dot > 0 ? key.slice(0, dot) : null;
    }
  }
  return best;
}

/** 返回资源可用的所有角色。admin 永远可用（授权管理权不受业务动作上限限制） */
export async function getAvailableRolesFromResource(resourceKey: string): Promise<string[]> {
  const max = await getResourceMaxRole(resourceKey);
  const maxLevel = ROLE_HIERARCHY[max] ?? 3;
  const businessRoles = (["access", "write", "delete"] as const).filter(
    (r) => (ROLE_HIERARCHY[r] ?? 0) <= maxLevel,
  );
  return [...businessRoles, "admin"]; // admin always available
}

/** 检查角色是否在资源允许范围内。admin 永远允许（不限制授权管理） */
export async function isRoleAllowedForResource(
  resourceKey: string,
  roleKey: string,
): Promise<boolean> {
  if (roleKey === "admin") return true;
  const available = await getAvailableRolesFromResource(resourceKey);
  return available.includes(roleKey);
}

export function clearMaxRoleCache() {
  cache = null; cacheTs = 0;
}
