import { pinyin } from "pinyin-pro";
import { prisma } from "./prisma";
import type { Prisma } from "./prisma";

type UserLookupClient = Pick<Prisma.TransactionClient, "user">;

const SURNAME_PINYIN_OVERRIDES: Record<string, string> = {
  "仇": "qiu",
};

function pinyinText(value: string) {
  if (!value) return "";
  const first = value[0];
  const override = first ? SURNAME_PINYIN_OVERRIDES[first] : undefined;
  const rest = override ? value.slice(1) : value;
  const converted = (pinyin(rest, { type: "array", toneType: "none" }) as string[]).join("");
  return `${override ?? ""}${converted}`;
}

export function usernameBaseFromName(name: string) {
  const converted = pinyinText(name.trim());
  const normalized = converted.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return normalized || "user";
}

export async function uniqueUsernameFromName(
  name: string,
  options: { suffix?: string | number | null; client?: UserLookupClient } = {},
) {
  const client = options.client ?? prisma;
  const base = usernameBaseFromName(name);
  const suffix = options.suffix == null ? "" : String(options.suffix).replace(/[^a-z0-9]+/gi, "");
  const candidates = [
    base,
    suffix ? `${base}${suffix}` : null,
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    const exists = await client.user.findUnique({ where: { username: candidate }, select: { id: true } });
    if (!exists) return candidate;
  }

  for (let attempt = 2; attempt <= 999; attempt += 1) {
    const candidate = suffix ? `${base}${suffix}${attempt}` : `${base}${attempt}`;
    const exists = await client.user.findUnique({ where: { username: candidate }, select: { id: true } });
    if (!exists) return candidate;
  }

  throw new Error("账号生成失败，请重试");
}
