import { prisma } from "@/lib/prisma";

let cache: Map<string, unknown> | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 30_000;

async function getAll(): Promise<
  Array<{
    code: string;
    name: string;
    managementGroup: string;
    codePoolCode: string | null;
    isActive: boolean;
    sortOrder: number;
  }>
> {
  const now = Date.now();
  if (cache && now - cacheTime < CACHE_TTL_MS) {
    return cache.get("all") as ReturnType<typeof getAll>;
  }
  const rows = await prisma.company.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      code: true,
      name: true,
      managementGroup: true,
      codePoolCode: true,
      isActive: true,
      sortOrder: true,
    },
  });
  cache = new Map();
  cache.set("all", rows);
  cacheTime = now;
  return rows;
}

export async function listActiveCompanies() {
  const all = await getAll();
  return all.filter((c) => c.isActive);
}

export async function getCompanyByCode(code: string) {
  const all = await getAll();
  return all.find((c) => c.code === code) ?? null;
}

export async function getCompanyNameByCode(code: string): Promise<string> {
  const c = await getCompanyByCode(code);
  return c?.name ?? code;
}

export async function getManagementGroupByCode(code: string): Promise<string> {
  const c = await getCompanyByCode(code);
  return c?.managementGroup ?? "常规体系";
}

/** 返回编码池 code；为空则回退到自身 code */
export async function getCodePoolCode(companyCode: string): Promise<string> {
  const c = await getCompanyByCode(companyCode);
  return c?.codePoolCode || companyCode;
}

export async function getCompanyCodesByManagementGroup(group: string): Promise<string[]> {
  const all = await getAll();
  return all.filter((c) => c.managementGroup === group).map((c) => c.code);
}

/** 兼容旧接口：编码 → 公司名 */
export async function getCompanyFromCode(code: string): Promise<string> {
  const prefix = code.slice(0, 2);
  return getCompanyNameByCode(prefix);
}

/** 兼容旧接口：是否为 GMP */
export async function isPharma(companyCode: string): Promise<boolean> {
  const group = await getManagementGroupByCode(companyCode);
  return group === "GMP";
}

/** 兼容旧接口：是否为常规体系 */
export async function isBio(companyCode: string): Promise<boolean> {
  const group = await getManagementGroupByCode(companyCode);
  return group !== "GMP";
}

/** 加载公司数据为同步查询结构（适合循环内批量使用） */
export async function loadCompanyMap(): Promise<
  Map<
    string,
    {
      code: string;
      name: string;
      managementGroup: string;
      codePoolCode: string | null;
      isActive: boolean;
      sortOrder: number;
    }
  >
> {
  const all = await getAll();
  return new Map(all.map((c) => [c.code, c]));
}

/** 从复合编码中解析公司 code（如 GW-01-01 → 01；01001 → 01） */
export function resolveCompanyCode(map: Map<string, unknown>, code: string): string {
  if (!code) return code;
  if (map.has(code)) return code;
  // 1) Split by common separators and match each part (e.g. GW-01-01 → 01)
  for (const part of code.split(/[-_/]/)) {
    if (map.has(part)) return part;
  }
  // 2) Fallback: find longest known prefix from map keys (e.g. "011" beats "01" for "01123")
  let best = "";
  for (const key of map.keys()) {
    if (typeof key === "string" && code.startsWith(key) && key.length > best.length) {
      best = key;
    }
  }
  return best || code;
}

/** 同步版本：需先调用 loadCompanyMap() */
export function getCompanyNameSync(map: Map<string, unknown>, code: string): string {
  const resolved = resolveCompanyCode(map, code);
  const c = map.get(resolved) as { name?: string } | undefined;
  return c?.name ?? code;
}

export function isPharmaSync(map: Map<string, unknown>, code: string): boolean {
  const resolved = resolveCompanyCode(map, code);
  const c = map.get(resolved) as { managementGroup?: string } | undefined;
  return c?.managementGroup === "GMP";
}

export function isBioSync(map: Map<string, unknown>, code: string): boolean {
  return !isPharmaSync(map, code);
}

export function getCodePoolCodeSync(map: Map<string, unknown>, companyCode: string): string {
  const c = map.get(companyCode) as { codePoolCode?: string | null } | undefined;
  return c?.codePoolCode || companyCode;
}

/** 清空缓存（测试或数据变更后调用） */
export function invalidateCompanyCache() {
  cache = null;
  cacheTime = 0;
}
