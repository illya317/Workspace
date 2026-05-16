import { pinyin } from "pinyin-pro";

export function getInitials(name: string): string {
  const result = pinyin(name, { type: "all" }) as Array<{ first: string }>;
  return result.map((r) => r.first).join("").toLowerCase();
}

export function matchEmployee(
  employee: { name?: string | null; alias?: string | null; employeeId?: string | null; username?: string | null },
  keyword: string
): boolean {
  const query = keyword.toLowerCase();
  const nameMatch = (employee.name || "").toLowerCase().includes(query);
  const aliasMatch = (employee.alias || "").toLowerCase().includes(query);
  const idMatch = (employee.employeeId || "").toLowerCase().includes(query);
  const usernameMatch = (employee.username || "").toLowerCase().includes(query);
  const initials = getInitials(employee.name || "");
  const pinyinMatch = initials.includes(query);
  return nameMatch || aliasMatch || idMatch || usernameMatch || pinyinMatch;
}
