import ethnicitiesConfig from "./data/ethnicities.json";
import professionalTitlesConfig from "./data/professional-titles.json";
import undergraduateMajorsCatalog from "./data/undergraduate-majors.json";

type HREthnicityConfig = {
  ethnicities: string[];
  commonEthnicities: string[];
};

type HRProfessionalTitleConfig = {
  groups: HRProfessionalTitleOption[];
  aliases: Record<string, string | null>;
};

type HRUndergraduateMajorRecord = {
  categoryName: string;
  className?: string;
  name?: string;
};

type HRUndergraduateMajorCatalog = {
  records: HRUndergraduateMajorRecord[];
};

const HR_ETHNICITY_CONFIG = ethnicitiesConfig as HREthnicityConfig;
const HR_PROFESSIONAL_TITLE_CONFIG = professionalTitlesConfig as HRProfessionalTitleConfig;
const HR_UNDERGRADUATE_MAJOR_CATALOG = undergraduateMajorsCatalog as HRUndergraduateMajorCatalog;

export const HR_ETHNICITIES = HR_ETHNICITY_CONFIG.ethnicities;

export const HR_COMMON_ETHNICITIES = HR_ETHNICITY_CONFIG.commonEthnicities;

export const HR_EDUCATIONS = ["博士", "硕士", "本科", "大专", "其他"];

export const HR_POLITICS = ["党员", "共青团员", "民主党派", "无党派人士", "群众"];

export const HR_ATTENDANCE_TYPES = ["全日制", "非全日制"];
export const HR_OFFICE_LOCATIONS = ["上海", "北京", "盐城", "境外"];
export const HR_LEGAL_RELATIONS = ["劳动关系", "劳务关系", "服务关系", "治理关系"];
export const HR_CONTRACT_TYPES = ["劳动合同", "劳务协议", "返聘协议", "顾问协议", "董事协议"];
export const HR_EMPLOYMENT_FORMS = ["全日制", "非全日制"];
export const HR_INSURANCE_STATUSES = ["已参保", "未参保", "已退休", "已停保"];
export const HR_PERSONNEL_TYPES = ["关键管理人员", "关键技术人员", "核心人员", "其他"];
export const HR_LEAVE_REASONS = ["个人原因", "协商解除", "合同到期", "公司解除", "退休", "其他"];
export const HR_RANKS = [
  "M4", "M5", "M6", "M7", "M8", "M9", "M10", "M11", "M12", "M13", "M14",
  "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P10", "P11", "P12",
  "T1", "T2", "T3", "T4",
];
export const HR_EMPLOYMENT_TITLES = ["董事", "顾问", "常务委员", "轮值委员"];

export type HRProfessionalTitleOption = {
  series: string;
  levels: Array<{ level: string; title: string }>;
};

export const HR_PROFESSIONAL_TITLE_GROUPS: HRProfessionalTitleOption[] = HR_PROFESSIONAL_TITLE_CONFIG.groups;

export const HR_PROFESSIONAL_TITLES = HR_PROFESSIONAL_TITLE_GROUPS.flatMap((group) =>
  group.levels.map((item) => item.title),
);

export function normalizeProfessionalTitle(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();
  if (!text) return null;
  const aliases = HR_PROFESSIONAL_TITLE_CONFIG.aliases;
  const normalized = Object.prototype.hasOwnProperty.call(aliases, text) ? aliases[text] : text;
  if (!normalized) return null;
  return HR_PROFESSIONAL_TITLES.includes(normalized) ? normalized : null;
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
