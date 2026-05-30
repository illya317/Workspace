/**
 * 从 DB 读取资源最高角色（maxRoleKey），带缓存。
 * 替代 lib/permissions.ts 中硬编码的 RESOURCE_MAX_ROLE。
 */
import { prisma } from "@/lib/prisma";

const ROLE_HIERARCHY: Record<string, number> = {
  access: 0, write: 1, delete: 2, admin: 3,
};

let cache: Record<string, string> | null = null;
let cacheTs = 0;
const CACHE_TTL = 60_000; // 1 分钟

async function loadCache(): Promise<Record<string, string>> {
  if (cache && Date.now() - cacheTs < CACHE_TTL) return cache;
  const resources = await prisma.resource.findMany({
    select: { key: true, maxRoleKey: true },
  });
  cache = {};
  for (const r of resources) {
    cache[r.key] = r.maxRoleKey;
  }
  cacheTs = Date.now();
  return cache;
}

function lookupParent(key: string): string | null {
  const lastDot = key.lastIndexOf(".");
  return lastDot > 0 ? key.slice(0, lastDot) : null;
}

/** 取祖先链上最严格的上限（父资源 access 时子资源不能突破为 admin） */
export async function getResourceMaxRole(resourceKey: string): Promise<string> {
  const map = await loadCache();
  let key: string | null = resourceKey;
  let best = "admin"; // 默认最宽松，沿链收紧
  while (key) {
    if (map[key]) {
      const cur = ROLE_HIERARCHY[map[key]] ?? 3;
      const prev = ROLE_HIERARCHY[best] ?? 3;
      if (cur < prev) best = map[key];
    }
    key = lookupParent(key);
  }
  return best;
}

/** 返回资源可用的所有角色 */
export async function getAvailableRolesFromResource(resourceKey: string): Promise<string[]> {
  const max = await getResourceMaxRole(resourceKey);
  const maxLevel = ROLE_HIERARCHY[max] ?? 3;
  return (["access", "write", "delete", "admin"] as const).filter(
    (r) => (ROLE_HIERARCHY[r] ?? 0) <= maxLevel,
  );
}

/** 检查角色是否在资源允许范围内 */
export async function isRoleAllowedForResource(
  resourceKey: string,
  roleKey: string,
): Promise<boolean> {
  const available = await getAvailableRolesFromResource(resourceKey);
  return available.includes(roleKey);
}

/** 清除缓存（供 seed/admin 变更后使用） */
export function clearMaxRoleCache() {
  cache = null;
  cacheTs = 0;
}
