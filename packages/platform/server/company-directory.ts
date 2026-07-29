import { prisma } from "@workspace/platform/server/prisma";
import { getTenantProfile } from "./tenant-config";

type CompanyDirectoryRow = {
  id: number;
  code: string;
  name: string;
  managementGroup: string;
  codePoolCode: string | null;
  isActive: boolean;
  sortOrder: number;
};

export interface CompanyDirectoryOption {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}

export interface CompanyDirectoryRecord extends CompanyDirectoryOption {
  managementGroup: string;
  codePoolCode: string | null;
  sortOrder: number;
}

let cache: Map<string, unknown> | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 30_000;

async function getAll(): Promise<CompanyDirectoryRow[]> {
  const now = Date.now();
  if (cache && now - cacheTime < CACHE_TTL_MS) {
    return cache.get("all") as CompanyDirectoryRow[];
  }
  const rows = await prisma.company.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      code: true,
      party: { select: { name: true } },
      managementGroup: true,
      codePoolCode: true,
      isActive: true,
      sortOrder: true,
    },
  });
  const directoryRows = rows.map(({ party, ...company }) => ({ ...company, name: party.name }));
  cache = new Map();
  cache.set("all", directoryRows);
  cacheTime = now;
  return directoryRows;
}

export async function listActiveCompanies() {
  const all = await getAll();
  return all.filter((company) => company.isActive);
}

export async function listCompanyDirectoryOptions(activeOnly = true): Promise<CompanyDirectoryOption[]> {
  const all = await getAll();
  return all
    .filter((company) => !activeOnly || company.isActive)
    .map(({ id, code, name, isActive }) => ({ id, code, name, isActive }));
}

export async function listCompanyDirectory(input: {
  keyword: string;
  activeOnly: boolean;
  page: number;
  pageSize: number;
}): Promise<{ companies: CompanyDirectoryRecord[]; total: number }> {
  const normalizedKeyword = input.keyword.trim().toLocaleLowerCase();
  const all = await getAll();
  const filtered = all.filter((company) => (
    (!input.activeOnly || company.isActive)
    && (!normalizedKeyword || [company.code, company.name].some((value) => (
      value.toLocaleLowerCase().includes(normalizedKeyword)
    )))
  ));
  const start = (input.page - 1) * input.pageSize;
  return {
    companies: filtered.slice(start, start + input.pageSize),
    total: filtered.length,
  };
}

export async function getCompanyByCode(code: string) {
  const all = await getAll();
  return all.find((company) => company.code === code) ?? null;
}

export async function getCompanyNameByCode(code: string): Promise<string> {
  const company = await getCompanyByCode(code);
  return company?.name ?? code;
}

export async function getManagementGroupByCode(code: string): Promise<string> {
  const company = await getCompanyByCode(code);
  return company?.managementGroup ?? getTenantProfile().organization.managementGroups.default;
}

export async function getCodePoolCode(companyCode: string): Promise<string> {
  const company = await getCompanyByCode(companyCode);
  return company?.codePoolCode || companyCode;
}

export async function loadCompanyMap(): Promise<Map<string, CompanyDirectoryRow>> {
  const all = await getAll();
  return new Map(all.map((company) => [company.code, company]));
}

export function resolveCompanyCode(map: Map<string, unknown>, code: string): string {
  if (!code) return code;
  if (map.has(code)) return code;
  for (const part of code.split(/[-_/]/)) {
    if (map.has(part)) return part;
  }
  let best = "";
  for (const key of map.keys()) {
    if (typeof key === "string" && code.startsWith(key) && key.length > best.length) {
      best = key;
    }
  }
  return best || code;
}

export function getCompanyNameSync(map: Map<string, unknown>, code: string): string {
  const resolved = resolveCompanyCode(map, code);
  const company = map.get(resolved) as { name?: string } | undefined;
  return company?.name ?? code;
}

export function isRegulatedManagementGroupSync(map: Map<string, unknown>, code: string): boolean {
  const resolved = resolveCompanyCode(map, code);
  const company = map.get(resolved) as { managementGroup?: string } | undefined;
  return company?.managementGroup === getTenantProfile().organization.managementGroups.regulated;
}

export function invalidateCompanyCache() {
  cache = null;
  cacheTime = 0;
}
