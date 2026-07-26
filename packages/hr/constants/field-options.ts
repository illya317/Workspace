import undergraduateMajorsCatalog from "./data/undergraduate-majors.json";
import type { TenantPublicConfig } from "@workspace/platform/tenant-config";

type HRUndergraduateMajorRecord = {
  categoryName: string;
  className?: string;
  name?: string;
};

type HRUndergraduateMajorCatalog = {
  records: HRUndergraduateMajorRecord[];
};

const HR_UNDERGRADUATE_MAJOR_CATALOG = undergraduateMajorsCatalog as HRUndergraduateMajorCatalog;

export type HRProfessionalTitleOption = {
  series: string;
  levels: Array<{ level: string; title: string }>;
};

export type TenantHrFieldOptions = TenantPublicConfig["hr"]["options"] & {
  ethnicities: string[];
  commonEthnicities: string[];
  editablePersonnelTypes: string[];
  professionalTitleGroups: HRProfessionalTitleOption[];
  professionalTitles: string[];
  professionalTitleAliases: Record<string, string | null>;
};

export function tenantHrFieldOptions(config: TenantPublicConfig): TenantHrFieldOptions {
  const options = config.hr.options;
  const professionalTitleGroups = config.hrCatalogs.professionalTitleGroups;
  return {
    ...options,
    ethnicities: config.hrCatalogs.ethnicities,
    commonEthnicities: config.hrCatalogs.commonEthnicities,
    editablePersonnelTypes: options.personnelTypes.filter((value) => value !== options.virtualEmployeePersonnelType),
    professionalTitleGroups,
    professionalTitles: professionalTitleGroups.flatMap((group) => group.levels.map((item) => item.title)),
    professionalTitleAliases: config.hrCatalogs.professionalTitleAliases,
  };
}

export function normalizeProfessionalTitle(value: unknown, options: TenantHrFieldOptions) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();
  if (!text) return null;
  const aliases = options.professionalTitleAliases;
  const normalized = Object.prototype.hasOwnProperty.call(aliases, text) ? aliases[text] : text;
  if (!normalized) return null;
  return options.professionalTitles.includes(normalized) ? normalized : null;
}

export type HRMajorItem = {
  category: string;
  specialty: string;
};

function cleanHrMajorName(value: unknown) {
  return String(value || "")
    .replace(/（注：[^）]*）/g, "")
    .trim();
}

export const HR_MAJOR_GROUPS = buildHrMajorGroups(HR_UNDERGRADUATE_MAJOR_CATALOG.records);
export const HR_MAJOR_OPTIONS = HR_MAJOR_GROUPS.flatMap((group) =>
  group.specialties.map((specialty) => ({
    category: group.category,
    specialty,
  })),
);
const HR_MAJOR_SPECIALTIES = new Set(HR_MAJOR_OPTIONS.map((option) => option.specialty));
const HR_MAJOR_CLASS_DEFAULTS = buildHrMajorClassDefaults(HR_UNDERGRADUATE_MAJOR_CATALOG.records);

function buildHrMajorGroups(records: HRUndergraduateMajorRecord[]) {
  const groups = new Map<string, Set<string>>();
  for (const record of records) {
    const category = record.categoryName.trim();
    const specialty = cleanHrMajorName(record.name || record.className || "");
    if (!category || !specialty) continue;
    if (!groups.has(category)) groups.set(category, new Set());
    groups.get(category)?.add(specialty);
  }
  return [...groups.entries()].map(([category, specialties]) => ({
    category,
    specialties: [...specialties],
  }));
}

function buildHrMajorClassDefaults(records: HRUndergraduateMajorRecord[]) {
  const classMap = new Map<string, string[]>();
  for (const record of records) {
    const className = String(record.className || "").trim();
    const specialty = cleanHrMajorName(record.name || "");
    if (!className || !specialty) continue;
    if (!classMap.has(className)) classMap.set(className, []);
    classMap.get(className)?.push(specialty);
  }

  const defaults = new Map<string, string>();
  for (const [className, specialties] of classMap.entries()) {
    const stem = className.replace(/类$/, "");
    defaults.set(className, specialties.includes(stem) ? stem : specialties[0] || stem);
  }
  return defaults;
}

function normalizeLegacyMajorSpecialty(value: unknown) {
  const text = cleanHrMajorName(value);
  if (!text) return "";
  if (HR_MAJOR_SPECIALTIES.has(text)) return text;
  const classDefault = HR_MAJOR_CLASS_DEFAULTS.get(text);
  if (classDefault) return classDefault;
  return text.endsWith("类") ? text.slice(0, -1) : text;
}

export function normalizeHrMajorItems(value: unknown): HRMajorItem[] {
  let raw = value;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return [];
    try {
      raw = JSON.parse(text);
    } catch {
      raw = text.split(/[,，、;；\n]+/).map((item) => item.trim()).filter(Boolean);
    }
  }

  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "string") return parseHrMajorPickerValue(item);
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const specialty = normalizeLegacyMajorSpecialty(record.specialty || record.name || "");
      const parsed = parseHrMajorPickerValue(specialty);
      return {
        category: String(record.category || parsed.category || "").trim(),
        specialty,
      };
    })
    .filter((item): item is HRMajorItem => Boolean(item && (item.category || item.specialty)));
}

export function isValidHrMajorItem(item: HRMajorItem) {
  const group = HR_MAJOR_GROUPS.find((entry) => entry.category === item.category);
  return Boolean(group && group.specialties.includes(item.specialty));
}

export function serializeHrMajorItems(value: unknown) {
  const seen = new Set<string>();
  const items = normalizeHrMajorItems(value)
    .filter((item) => {
      if (!item.specialty) return false;
      const key = item.specialty;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (items.length === 0) return null;
  if (items.length === 1) return items[0]?.specialty ?? null;
  return JSON.stringify(items.map((item) => item.specialty));
}

const HR_MAJOR_PICKER_SEPARATOR = "\u001F";

export function getHrMajorPickerValue(item: HRMajorItem) {
  return `${item.category}${HR_MAJOR_PICKER_SEPARATOR}${item.specialty}`;
}

export function parseHrMajorPickerValue(value: string | null | undefined): HRMajorItem {
  const text = String(value || "").trim();
  if (!text) return { category: "", specialty: "" };
  const [category, specialty] = text.split(HR_MAJOR_PICKER_SEPARATOR);
  if (specialty !== undefined) return { category: category.trim(), specialty: normalizeLegacyMajorSpecialty(specialty) };
  const normalized = normalizeLegacyMajorSpecialty(text);
  for (const group of HR_MAJOR_GROUPS) {
    if (group.specialties.includes(normalized)) return { category: group.category, specialty: normalized };
  }
  return { category: "", specialty: normalized };
}

export function getHrMajorPickerOptions(extraItems: HRMajorItem[] = []) {
  const options = HR_MAJOR_GROUPS.flatMap((group) =>
    group.specialties.map((specialty) => ({
      label: specialty,
      value: getHrMajorPickerValue({ category: group.category, specialty }),
    })),
  );
  const seen = new Set(options.map((option) => option.value));
  for (const item of extraItems) {
    if (item.category === "不限" || item.specialty === "不限专业") continue;
    const value = getHrMajorPickerValue(item);
    const label = item.specialty || item.category;
    if (!label || seen.has(value)) continue;
    options.push({ label, value });
    seen.add(value);
  }
  return options;
}

export function formatHrMajorItems(value: unknown) {
  const items = normalizeHrMajorItems(value);
  if (items.length === 0) return "";
  return items
    .map((item) => item.specialty || item.category)
    .filter(Boolean)
    .join("；");
}

export function isAllowedHrOption(value: unknown, options: readonly string[]) {
  if (value === null || value === undefined || value === "") return true;
  return typeof value === "string" && options.includes(value);
}
