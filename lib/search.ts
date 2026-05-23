import { pinyin } from "pinyin-pro";

// ─── Pinyin ─────────────────────────────────────────────────

export function getInitials(name: string): string {
  const result = pinyin(name, { type: "all" }) as Array<{ first: string }>;
  return result.map((r) => r.first).join("").toLowerCase();
}

// ─── Search ─────────────────────────────────────────────────

export function matchEmployee(
  employee: { name?: string | null; alias?: string | null; employeeId?: string | null; username?: string | null },
  keyword: string
): boolean {
  const query = keyword.toLowerCase();
  if ((employee.name || "").toLowerCase().includes(query)) return true;
  if ((employee.alias || "").toLowerCase().includes(query)) return true;
  if ((employee.employeeId || "").toLowerCase().includes(query)) return true;
  if ((employee.username || "").toLowerCase().includes(query)) return true;
  if (getInitials(employee.name || "").includes(query)) return true;
  return false;
}
