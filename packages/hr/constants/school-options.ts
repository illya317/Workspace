import chinaInstitutionsCatalog from "./data/china-institutions.json";
import qsWorldRankingsCatalog from "./data/qs-world-rankings.json";
import type { TenantHrCatalogs } from "@workspace/platform/tenant-config";

type ChinaInstitutionRecord = {
  name: string;
  kind: string;
  level: string;
  province: string;
  city: string;
};

type QsRankingRecord = {
  name: string;
  rankDisplay: string;
  region: string;
  country: string;
  city: string;
};

type ChinaInstitutionCatalog = {
  records: ChinaInstitutionRecord[];
};

type QsWorldRankingsCatalog = {
  records: QsRankingRecord[];
};

type SchoolOption = {
  label: string;
  value: string;
  aliases?: string[];
};

const chinaInstitutions = (chinaInstitutionsCatalog as ChinaInstitutionCatalog).records;
const qsWorldRankings = (qsWorldRankingsCatalog as QsWorldRankingsCatalog).records;
function uniqByValue(options: SchoolOption[]) {
  const seen = new Set<string>();
  const next: SchoolOption[] = [];
  for (const option of options) {
    if (!option.value || seen.has(option.value)) continue;
    seen.add(option.value);
    next.push(option);
  }
  return next;
}

export function tenantHrSchoolOptions(catalogs: TenantHrCatalogs) {
  return uniqByValue([
  ...catalogs.specialSchools.map((school) => ({
    label: school.label || school.name,
    value: school.name,
    aliases: school.aliases || [],
  })),
  ...chinaInstitutions.map((school) => ({
    label: school.name,
    value: school.name,
  })),
  ...qsWorldRankings.map((school) => ({
    label: school.name,
    value: school.name,
  })),
  ]);
}

export function normalizeHrSchoolValue(value: unknown, catalogs: TenantHrCatalogs) {
  if (value === null || value === undefined || value === "") {
    return { ok: true as const, value: null };
  }
  const school = String(value).trim();
  if (!school) return { ok: true as const, value: null };
  const allowedValues = new Set(tenantHrSchoolOptions(catalogs).map((option) => option.value));
  if (!allowedValues.has(school)) {
    return { ok: false as const, error: "毕业院校必须从学校库或白名单中选择" };
  }
  return { ok: true as const, value: school };
}
