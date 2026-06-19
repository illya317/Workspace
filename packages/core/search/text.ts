import { pinyin } from "pinyin-pro";

export function getInitials(name: string): string {
  const result = pinyin(name, { type: "all" }) as Array<{ first: string }>;
  return result.map((r) => r.first).join("").toLowerCase();
}

export function getPinyinText(text: string): string {
  return (pinyin(text, { type: "array", toneType: "none" }) as string[]).join("").toLowerCase();
}

export function matchText(text: string, query: string): boolean {
  const q = query.toLowerCase();
  const s = text.toLowerCase();
  if (s.includes(q)) return true;
  if (getInitials(text).includes(q)) return true;
  if (getPinyinText(text).includes(q)) return true;
  return false;
}
