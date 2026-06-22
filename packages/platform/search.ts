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
  return matchSearchFields(
    {
      name: employee.name,
      alias: employee.alias,
      employeeId: employee.employeeId,
      username: employee.username,
    },
    keyword,
    ["name", "alias", "employeeId", "username"],
  );
}

export function matchAnyField(
  record: Record<string, unknown>,
  keyword: string,
  modelName?: string,
): boolean {
  const fields = modelName ? DEFAULT_SEARCH_FIELDS[modelName] : undefined;
  if (modelName && !fields) return false;
  return matchSearchFields(record, keyword, fields);
}

export function matchSearchFields(
  record: object,
  keyword: string,
  fields?: readonly string[],
): boolean {
  const query = keyword.trim();
  if (!query) return true;
  const values = record as Record<string, unknown>;
  const entries = fields
    ? fields.map((field) => [field, values[field]] as const)
    : Object.entries(values);
  return entries.some(([field, raw]) => {
    const rawValue = field === "alias" ? aliasSearchText(raw) : raw;
    return matchText(String(rawValue ?? ""), query);
  });
}

export function getSearchFields(modelName: string): string[] {
  return DEFAULT_SEARCH_FIELDS[modelName] || [];
}
