/**
 * system.admin 业务模块 bypass 开关。
 * ON (默认): system.admin 可 bypass 所有业务权限（兼容旧行为）
 * OFF: system.admin 只保证能进入 /admin，业务页面需单独授权
 */
import { prisma } from "@workspace/platform/server/prisma";

const KEY = "systemAdminBusinessBypass";
let _cache: boolean | null = null;
let _cacheTs = 0;
const TTL = 30_000;

export async function isSystemAdminBypassEnabled(): Promise<boolean> {
  if (_cache !== null && Date.now() - _cacheTs < TTL) return _cache;
  const config = await prisma.systemConfig.findUnique({ where: { key: KEY } });
  _cache = config?.value !== "false"; // 默认 true
  _cacheTs = Date.now();
  return _cache;
}

/** 供 seed/API 更新后清除缓存 */
export function clearBypassCache() {
  _cache = null;
  _cacheTs = 0;
}
