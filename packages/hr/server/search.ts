import { getInitials, getPinyinText } from "@workspace/core/search";

const SEARCH_FIELDS: Record<string, string[]> = {
  Employee: [
    "employeeId", "name", "alias", "idNumber", "otherId",
    "phone", "ethnicity", "hometown", "politics",
    "education", "title", "school", "major",
  ],
  Department: ["code", "name", "alias"],
  Company: ["code", "name", "fullName"],
  Project: ["name", "type", "description"],
  Position: ["code", "name", "alias"],
};

const PINYIN_FIELDS = new Set(["name", "alias"]);

function aliasSearchText(value: unknown): string {
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
  employee: { name?: string | null; alias?: string | null; employeeId?: string | null; username?: string | null },
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
  modelName: string,
): boolean {
  const fields = SEARCH_FIELDS[modelName];
  if (!fields) return false;

  const query = keyword.toLowerCase();

  for (const field of fields) {
    const rawValue = field === "alias" ? aliasSearchText(record[field]) : record[field];
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
  return SEARCH_FIELDS[modelName] || [];
}
