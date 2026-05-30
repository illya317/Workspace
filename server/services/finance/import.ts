import * as iconv from "iconv-lite";

// ─── Types ───────────────────────────────────────────────

export type ImportType = "balance" | "journal" | "account";

export interface PreviewResult {
  type: ImportType;
  companyCode: string;
  year: number;
  sourceFileName?: string;
  rows: number;
  accounts: PreviewAccount[];
  vouchers?: PreviewVoucher[];
  balances?: PreviewBalance[];
  errors: string[];
  warnings: string[];
}

export interface PreviewAccount {
  code: string;
  name: string;
  parentCode: string | null;
  category: string;
  balanceDirection: string;
  mnemonicCode?: string | null;
  currency?: string | null;
  subjectLevel?: number | null;
}

export interface PreviewVoucher {
  voucherNo: string;
  date: string;
  description: string;
  items: PreviewVoucherItem[];
  totalDebit: number;
  totalCredit: number;
}

export interface PreviewVoucherItem {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description: string;
}

export interface PreviewBalance {
  accountCode: string;
  accountName: string;
  openingDebit: number;
  openingCredit: number;
  currentDebit: number;
  currentCredit: number;
  closingDebit: number;
  closingCredit: number;
}

// ─── Shared Helpers ──────────────────────────────────────

export function detectCategory(code: string, name: string): string {
  const c = code.trim();
  const n = name.trim();
  if (n.includes("资产") || (n.includes("小计") && c.startsWith("1"))) return "asset";
  if (n.includes("负债") || n.includes("权益"))
    return c.startsWith("2") || c.startsWith("3") || c.startsWith("4") ? "liability" : "equity";
  if (c.startsWith("1")) return "asset";
  if (c.startsWith("2")) return "liability";
  if (c.startsWith("3")) return "equity";
  if (c.startsWith("4")) return "equity";
  if (c.startsWith("5")) return "cost";
  if (c.startsWith("6")) {
    if (n.includes("收入")) return "revenue";
    return "expense";
  }
  return "other";
}

export function detectBalanceDirection(code: string, name: string): string {
  const c = code.trim();
  const n = name.trim();
  // 累计折旧、减值准备等备抵科目贷方
  if (n.includes("累计折旧") || n.includes("减值准备") || n.includes("坏账准备")) return "credit";
  if (c.startsWith("1") || c.startsWith("5")) return "debit";
  if (c.startsWith("2") || c.startsWith("3") || c.startsWith("4")) return "credit";
  if (c.startsWith("6")) {
    if (n.includes("收入")) return "credit";
    return "debit";
  }
  return "debit";
}

export function parseAmount(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const s = v.replace(/,/g, "").replace(/[^\d.-]/g, "").trim();
    if (s === "" || s === "-") return 0;
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

// sheetjs 读取 .xls 时会把 GBK trail byte 0x80-0x9F 错误映射为 Windows-1252 字符
// 先还原这些字符，再做 latin1 -> GBK 解码
const WIN1252_REV: Record<string, string> = {
  "€": "\x80",
  "‚": "\x82",
  "ƒ": "\x83",
  "„": "\x84",
  "…": "\x85",
  "†": "\x86",
  "‡": "\x87",
  "ˆ": "\x88",
  "‰": "\x89",
  "Š": "\x8A",
  "‹": "\x8B",
  "Œ": "\x8C",
  "Ž": "\x8E",
  "‘": "\x91",
  "’": "\x92",
  "“": "\x93",
  "”": "\x94",
  "•": "\x95",
  "–": "\x96",
  "—": "\x97",
  "˜": "\x98",
  "™": "",
  "š": "\x9A",
  "›": "\x9B",
  "œ": "\x9C",
  "ž": "\x9E",
  "Ÿ": "\x9F",
};

function restoreWin1252Bytes(str: string): string {
  let result = "";
  for (const c of str) {
    result += WIN1252_REV[c] ?? c;
  }
  return result;
}

export function fixGBK(str: string): string {
  if (!str || typeof str !== "string") return str;
  const restored = restoreWin1252Bytes(str);
  const buf = Buffer.from(restored, "latin1");
  const decoded = iconv.decode(buf, "gbk");
  // CJK 汉字 + 扩展A + CJK 标点 + 全角字符（含％、＄等）
  const CJK_RE = /[一-鿿㐀-䶿　-〿＀-￯]/g;

  // 如果解码后没有乱码（替换字符/控制字符）且有更多中文，使用解码结果
  const decodedHasGarbage = /[\x00-\x08\x0b-\x0c\x0e-\x1f�]/.test(decoded);
  const strHasGarbage = /[\x00-\x08\x0b-\x0c\x0e-\x1f�]/.test(str);
  const decodedCJKCount = (decoded.match(CJK_RE) || []).length;
  const strCJKCount = (str.match(CJK_RE) || []).length;

  if (!decodedHasGarbage && decodedCJKCount >= strCJKCount) {
    return decoded;
  }

  // 如果原字符串有乱码但解码后没有，也使用解码结果
  if (strHasGarbage && !decodedHasGarbage) {
    return decoded;
  }

  return str;
}

export function fixRowEncoding(row: unknown[]): unknown[] {
  return row.map((cell) => (typeof cell === "string" ? fixGBK(cell) : cell));
}

export function hasEncodingIssue(str: string): boolean {
  return typeof str === "string" && str.includes("�");
}

export function isSummaryRow(code: string, name: string): boolean {
  const n = (name || "").trim();
  const c = (code || "").trim();
  if (!c || c === "NaN") return true;
  if (n.includes("小计") || n.includes("合计") || n === "合计") return true;
  return false;
}

export function getParentCode(code: string): string | null {
  if (code.length <= 4) return null;
  // 会计科目层级：4位→6位→8位→10位，每级加2位
  // 1002 → 一级, 100201 → 二级(parent=1002), 10020101 → 三级(parent=100201)
  const parentLen = code.length - 2;
  if (parentLen >= 4) return code.slice(0, parentLen);
  return null;
}

export function calcSubjectLevel(code: string): number {
  const len = code.length;
  if (len <= 4) return 1;
  return (len - 4) / 2 + 1;
}

export function mapCategory(type: string, name: string, code?: string): string {
  const t = (type || "").trim();
  const n = (name || "").trim();
  if (t === "资产") return "asset";
  if (t === "负债") return "liability";
  if (t === "权益") return "equity";
  if (t === "成本") return "cost";
  if (t === "损益") {
    if (n.includes("收入")) return "revenue";
    return "expense";
  }
  if (code) return detectCategory(code, name);
  return "other";
}

export function mapDirection(dir: string): string {
  const d = (dir || "").trim();
  if (d === "借" || d === "借方") return "debit";
  if (d === "贷" || d === "贷方") return "credit";
  return "debit";
}

// ─── Re-exports ──────────────────────────────────────────

export { parseBalanceSheet } from "./parsers/balance-parser";
export { parseJournal } from "./parsers/voucher-parser";
export { parseAccountTable } from "./parsers/account-parser";
