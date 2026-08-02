import * as XLSX from "xlsx";
import type { AssetWorkbookBlocker, AssetWorkbookControl, AssetWorkbookScope } from "./current-period-workbook-types";
import { moneyEquals } from "./money-cents";

export type WorkbookRows = unknown[][];

export const money = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 100) / 100 : 0;
};
export const cellText = (value: unknown) => String(value ?? "").trim();
export const cellNumber = (value: unknown) => {
  if (value == null || (typeof value === "string" && !value.trim())) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

export function readRows(workbook: XLSX.WorkBook, sheetName: string) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`缺少资产底稿：${sheetName}`);
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }) as WorkbookRows;
}

export function sourceCellFormula(workbook: XLSX.WorkBook, sheetName: string, address: string) {
  return workbook.Sheets[sheetName]?.[address]?.f;
}

export function parseSourceDate(value: unknown) {
  if (typeof value === "number" && value >= 30_000) {
    const parsed = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
  }
  const text = cellText(value);
  if (!text) return undefined;
  const match = text.match(/(20\d{2})[.\/-](\d{1,2})(?:[.\/-](\d{1,2}))?/);
  return match ? `${match[1]}-${pad(Number(match[2]))}-${pad(Number(match[3] ?? 1))}` : undefined;
}

export function parsePeriod(value: unknown) {
  if (typeof value === "number" && value >= 30_000) {
    const date = parseSourceDate(value);
    return date ? { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)), raw: String(value) } : undefined;
  }
  const raw = cellText(value);
  const match = raw.match(/(20\d{2})\s*(?:年|[.\/-])\s*(\d{1,2})\s*(?:月)?/);
  return match ? { year: Number(match[1]), month: Number(match[2]), raw } : undefined;
}

export function openingAsOfDate(scope: AssetWorkbookScope) {
  return new Date(Date.UTC(scope.year, scope.month - 1, 0)).toISOString().slice(0, 10);
}

export function factRange(sheetName: string, startColumn: string, endColumn: string, row: number) {
  return `${sheetName}!${startColumn}${row}:${endColumn}${row}`;
}

export function recordControl(
  controls: AssetWorkbookControl[],
  blockers: AssetWorkbookBlocker[],
  input: Omit<AssetWorkbookControl, "status" | "difference"> & { blockerCode?: string; blockerMessage?: string },
) {
  const { blockerCode, blockerMessage, ...control } = input;
  if (input.expected == null || input.actual == null) {
    controls.push({ ...control, status: "missing" });
    if (blockerCode) blockers.push({ code: blockerCode, message: blockerMessage ?? input.note ?? input.key, sourceSheet: input.sourceSheet, sourceRange: input.sourceRange });
    return;
  }
  const difference = money(input.actual - input.expected);
  const status = moneyEquals(input.actual, input.expected) ? "pass" : "fail";
  controls.push({ ...control, difference, status });
  if (status === "fail" && blockerCode) blockers.push({ code: blockerCode, message: `${blockerMessage ?? input.key}（差异 ${difference.toFixed(2)}）`, sourceSheet: input.sourceSheet, sourceRange: input.sourceRange });
}

export function recordPeriodEvidence(
  evidence: Array<{ sourceSheet: string; sourceRange: string; year?: number; month?: number; raw: string }>,
  blockers: AssetWorkbookBlocker[],
  scope: AssetWorkbookScope,
  sourceSheet: string,
  sourceRange: string,
  rawValue: unknown,
) {
  const parsed = parsePeriod(rawValue);
  evidence.push({ sourceSheet, sourceRange, year: parsed?.year, month: parsed?.month, raw: parsed?.raw ?? cellText(rawValue) });
  if (!parsed || parsed.year !== scope.year || parsed.month !== scope.month) {
    blockers.push({ code: "ASSET_PERIOD_MISMATCH", message: `底稿期间与导入 scope ${scope.year}-${pad(scope.month)} 不一致`, sourceSheet, sourceRange });
  }
}

export function impliedLifeFromAmount(originalCost: number, currentAmount: number) {
  if (originalCost <= 0 || currentAmount <= 0) return undefined;
  const months = Math.round(originalCost / currentAmount);
  return months > 0 && Math.abs(money(originalCost / months) - money(currentAmount)) <= 0.05 ? months : undefined;
}

export function pad(value: number) {
  return String(value).padStart(2, "0");
}
