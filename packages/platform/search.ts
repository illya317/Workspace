import { getInitials, getPinyinText, matchText } from "@workspace/core/search";

export { getInitials, getPinyinText, matchText };

const DEFAULT_SEARCH_FIELDS: Record<string, string[]> = {
  Employee: [
    "employeeId",
    "name",
    "alias",
    "idNumber",
    "otherId",
    "phone",
    "ethnicity",
    "hometown",
    "politics",
    "education",
    "title",
    "school",
    "major",
  ],
  Department: ["code", "name", "alias"],
  Company: ["code", "name", "fullName"],
  Project: ["name", "type", "description"],
  Position: ["code", "name", "alias"],
};

const PINYIN_FIELDS = new Set(["name", "alias"]);

export function aliasSearchText(value: unknown): string {
  if (!value) return "";
  const text = String(value);
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).join(" ") : text;
  } catch {
    return text;
  }
}

export function matchEmployee(
  employee: {
    name?: string | null;
    alias?: string | null;
    employeeId?: string | null;
    username?: string | null;
  },
  keyword: string,
): boolean {
  const query = keyword.toLowerCase();
  const alias = aliasSearchText(employee.alias);
  if ((employee.name || "").toLowerCase().includes(query)) return true;
  if (alias.toLowerCase().includes(query)) return true;
  if ((employee.employeeId || "").toLowerCase().includes(query)) return true;
  if ((employee.username || "").toLowerCase().includes(query)) return true;
  if (getInitials(employee.name || "").includes(query)) return true;
  if (getInitials(alias).includes(query)) return true;
  if (getPinyinText(employee.name || "").includes(query)) return true;
  if (getPinyinText(alias).includes(query)) return true;
  return false;
}

export function matchAnyField(
  record: Record<string, unknown>,
  keyword: string,
  modelName?: string,
): boolean {
  const query = keyword.trim().toLowerCase();
  if (!query) return true;

  const fields = modelName ? DEFAULT_SEARCH_FIELDS[modelName] : undefined;
  if (modelName && !fields) return false;

  const entries = fields
    ? fields.map((field) => [field, record[field]] as const)
    : Object.entries(record);

  for (const [field, raw] of entries) {
    const rawValue = field === "alias" ? aliasSearchText(raw) : raw;
    const value = String(rawValue ?? "").toLowerCase();
    if (value.includes(query)) return true;
    if (PINYIN_FIELDS.has(field)) {
      if (getInitials(value).includes(query)) return true;
      if (getPinyinText(value).includes(query)) return true;
    }
  }
  return false;
}

export function getSearchFields(modelName: string): string[] {
  return DEFAULT_SEARCH_FIELDS[modelName] || [];
}
