import { pinyin } from "pinyin-pro";

// ─── Pinyin ─────────────────────────────────────────────────

export function getInitials(name: string): string {
  const result = pinyin(name, { type: "all" }) as Array<{ first: string }>;
  return result.map((r) => r.first).join("").toLowerCase();
}

export function getPinyinText(text: string): string {
  return (pinyin(text, { type: "array", toneType: "none" }) as string[]).join("").toLowerCase();
}

/** 通用文本匹配：直接包含 + 拼音首字母 + 拼音全拼 */
export function matchText(text: string, query: string): boolean {
  const q = query.toLowerCase();
  const s = text.toLowerCase();
  if (s.includes(q)) return true;
  if (getInitials(text).includes(q)) return true;
  if (getPinyinText(text).includes(q)) return true;
  return false;
}

function aliasSearchText(alias: string | null | undefined): string {
  if (!alias) return "";
  try {
    const parsed = JSON.parse(alias);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).join(" ") : alias;
  } catch {
    return alias;
  }
}

// ─── Search ─────────────────────────────────────────────────

export function matchEmployee(
  employee: { name?: string | null; alias?: string | null; employeeId?: string | null; username?: string | null },
  keyword: string
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
