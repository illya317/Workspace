import type {
  AmountOriginQuery,
  EvidenceSourceKind,
  StatementTargetRef,
} from "@workspace/finance/types/statement-explanation";

import { currencyScale, parseDecimalToMinorUnits } from "./decimal";

/** 查询输入校验失败：fail closed，不带部分结果。 */
export class AmountOriginQueryError extends Error {
  readonly name = "AmountOriginQueryError";
}

export const EVIDENCE_SOURCE_KINDS: readonly EvidenceSourceKind[] = [
  "voucherLine",
  "consolidationMatch",
  "reclassLineage",
  "fxTrace",
  "workbookCell",
];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** 科目提示只允许编码/文字字符；显式拒绝 LIKE 通配符，防止匹配语义被悄悄放宽。 */
const ACCOUNT_HINT_PATTERN = /^[0-9A-Za-z一-鿿]+$/;
const MAX_COMPANY_SCOPE = 64;
const MAX_ACCOUNT_HINTS = 16;
const HARD_MAX_TERMS = 6;

export interface NormalizedReportContext {
  target: StatementTargetRef;
  lineCode: string | null;
  workbookCell: string | null;
}

export interface NormalizedQuery {
  targetMinor: bigint;
  toleranceMinor: bigint;
  scale: number;
  currencyCode: string;
  companyIds: readonly number[] | null;
  dateFrom: string | null;
  dateTo: string | null;
  accountHints: readonly string[];
  reportContext: NormalizedReportContext | null;
  maxTerms: number;
  sourceKinds: ReadonlySet<EvidenceSourceKind>;
}

function fail(message: string): never {
  throw new AmountOriginQueryError(message);
}

function normalizeDate(raw: string, field: string): string {
  if (!DATE_PATTERN.test(raw)) fail(`${field} must be YYYY-MM-DD: ${raw}`);
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    fail(`${field} is not a valid calendar date: ${raw}`);
  }
  return raw;
}

function normalizePositiveInt(raw: unknown, field: string): number {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) {
    fail(`${field} must be a positive integer`);
  }
  return raw;
}

function normalizeTarget(raw: StatementTargetRef): StatementTargetRef {
  if (!raw || typeof raw !== "object") fail("reportContext.target is required");
  if (raw.kind === "entity") {
    normalizePositiveInt(raw.companyId, "target.companyId");
    normalizePositiveInt(raw.year, "target.year");
    if (!Number.isInteger(raw.month) || raw.month < 1 || raw.month > 12) fail("target.month must be 1..12");
    if (raw.periodKind !== "monthly" && raw.periodKind !== "cumulative") fail("target.periodKind invalid");
    if (!["balance", "income", "cashflow"].includes(raw.reportType)) fail("target.reportType invalid");
    if (typeof raw.targetFingerprint !== "string" || !raw.targetFingerprint.trim()) {
      fail("target.targetFingerprint is required");
    }
    return raw;
  }
  if (raw.kind === "consolidated") {
    normalizePositiveInt(raw.parentCompanyId, "target.parentCompanyId");
    normalizePositiveInt(raw.batchId, "target.batchId");
    normalizePositiveInt(raw.outputSnapshotId, "target.outputSnapshotId");
    if (!["balance", "income", "cashflow"].includes(raw.reportType)) fail("target.reportType invalid");
    if (typeof raw.targetFingerprint !== "string" || !raw.targetFingerprint.trim()) {
      fail("target.targetFingerprint is required");
    }
    return raw;
  }
  fail("target.kind must be entity or consolidated");
}

/** 规范化 + fail-closed 校验查询输入（计划 §4.4 第 1 步）。 */
export function normalizeQuery(query: AmountOriginQuery): NormalizedQuery {
  if (!query || typeof query !== "object") fail("query is required");
  if (typeof query.currencyCode !== "string" || !/^[A-Za-z]{3}$/.test(query.currencyCode)) {
    fail("currencyCode must be a 3-letter code");
  }
  const currencyCode = query.currencyCode.toUpperCase();
  const scale = currencyScale(currencyCode);
  const targetMinor = parseDecimalToMinorUnits(query.targetAmount, scale);
  if (targetMinor === 0n) fail("targetAmount must be non-zero");
  const toleranceMinor = query.tolerance === undefined
    ? 0n
    : parseDecimalToMinorUnits(query.tolerance, scale);

  const companyIds = query.companyIds === undefined
    ? null
    : [...new Set(query.companyIds.map((id) => normalizePositiveInt(id, "companyIds[]")))];
  if (companyIds && companyIds.length === 0) fail("companyIds must not be empty");
  if (companyIds && companyIds.length > MAX_COMPANY_SCOPE) {
    fail(`company scope exceeds ${MAX_COMPANY_SCOPE}`);
  }

  const dateFrom = query.dateFrom === undefined ? null : normalizeDate(query.dateFrom, "dateFrom");
  const dateTo = query.dateTo === undefined ? null : normalizeDate(query.dateTo, "dateTo");
  if (dateFrom && dateTo && dateFrom > dateTo) fail("dateFrom must not be after dateTo");

  const accountHints = (query.accountHints ?? []).map((hint) => {
    if (typeof hint !== "string") fail("accountHints[] must be strings");
    const trimmed = hint.trim();
    if (!trimmed || trimmed.length > 32 || !ACCOUNT_HINT_PATTERN.test(trimmed)) {
      fail(`invalid account hint: ${JSON.stringify(hint)}`);
    }
    return trimmed;
  });
  if (accountHints.length > MAX_ACCOUNT_HINTS) fail(`account hints exceed ${MAX_ACCOUNT_HINTS}`);

  const reportContext = query.reportContext === undefined
    ? null
    : {
        target: normalizeTarget(query.reportContext.target),
        lineCode: query.reportContext.lineCode?.trim() || null,
        workbookCell: query.reportContext.workbookCell?.trim() || null,
      };

  const maxTerms = query.maxTerms ?? HARD_MAX_TERMS;
  if (!Number.isInteger(maxTerms) || maxTerms < 1 || maxTerms > HARD_MAX_TERMS) {
    fail(`maxTerms must be 1..${HARD_MAX_TERMS}`);
  }

  const sourceKinds = new Set<EvidenceSourceKind>(
    (query.sourceKinds ?? EVIDENCE_SOURCE_KINDS).map((kind) => {
      if (!EVIDENCE_SOURCE_KINDS.includes(kind)) fail(`unknown sourceKind: ${kind}`);
      return kind;
    }),
  );

  return {
    targetMinor,
    toleranceMinor,
    scale,
    currencyCode,
    companyIds,
    dateFrom,
    dateTo,
    accountHints,
    reportContext,
    maxTerms,
    sourceKinds,
  };
}

export function monthStartDate(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function monthEndDate(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}
