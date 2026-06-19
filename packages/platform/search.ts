import { getInitials, getPinyinText, matchText } from "@workspace/core/search";

export { getInitials, getPinyinText, matchText };

function aliasSearchText(alias: string | null | undefined): string {
  if (!alias) return "";
  try {
    const parsed = JSON.parse(alias);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).join(" ") : alias;
  } catch {
    return alias;
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
