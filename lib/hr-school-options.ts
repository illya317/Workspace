import chinaInstitutionsCatalog from "../../.workspace/data/reference/education/china-higher-education-institutions-2025.json";
import qsWorldRankingsCatalog from "../../.workspace/data/reference/education/qs-world-university-rankings-2027.json";
import schoolWhitelistConfig from "../../.workspace/config/hr/school-whitelist.json";

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

type SchoolWhitelistConfig = {
  specialSchools: Array<{
    name: string;
    label?: string;
    aliases?: string[];
  }>;
};

type SchoolOption = {
  label: string;
  value: string;
  aliases?: string[];
};

const chinaInstitutions = (chinaInstitutionsCatalog as ChinaInstitutionCatalog).records;
const qsWorldRankings = (qsWorldRankingsCatalog as QsWorldRankingsCatalog).records;
const specialSchools = (schoolWhitelistConfig as SchoolWhitelistConfig).specialSchools;

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

export const HR_SCHOOL_OPTIONS = uniqByValue([
  ...specialSchools.map((school) => ({
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

export const HR_ALLOWED_SCHOOL_VALUES = new Set(HR_SCHOOL_OPTIONS.map((option) => option.value));

export function normalizeHrSchoolValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return { ok: true as const, value: null };
  }
  const school = String(value).trim();
  if (!school) return { ok: true as const, value: null };
  if (!HR_ALLOWED_SCHOOL_VALUES.has(school)) {
    return { ok: false as const, error: "毕业院校必须从学校库或白名单中选择" };
  }
  return { ok: true as const, value: school };
}
