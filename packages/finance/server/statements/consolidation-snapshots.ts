import type { StatementReportType } from "@workspace/finance/types";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { getTenantProfile } from "@workspace/platform/server/tenant-config";
import { consolidationSourceFactFingerprint } from "./consolidation-fingerprints";
import {
  consolidationCutoverBaselineFact,
  frozenCutoverBaselineKey,
  selectedConsolidationCutoverBaseline,
} from "./consolidation-cutover-baseline";
import {
  loadConsolidationSourceReadiness,
  type ConsolidationEntitySourceReadiness,
} from "./consolidation-source-readiness";
import { generateFinanceReport } from "./report-generator";
import {
  loadCashFlowConfig,
  loadIncomeStatementConfig,
} from "./config/load-config-reports";
import { computeCashFlowMonthlySystemAmounts } from "./reports/cash-flow-system-amounts";
import { buildIncomeLines } from "./reports/direct";
import { computeIncomeMonthlySystemAmounts } from "./reports/income-system-amounts";
import type { StatementPeriodKind } from "@workspace/finance/types/statement-period";

export { consolidationFingerprint } from "./consolidation-fingerprints";

const REPORT_TYPES = ["balanceSheet", "incomeStatement", "cashFlow"] as const;

export class ConsolidationSnapshotError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export interface ConsolidationScopeFact {
  companyId: number;
  companyCode: string;
  companyName: string;
  role: "parent" | "subsidiary";
  directParentCompanyId: number | null;
  directParentCode: string | null;
  relationId: number | null;
  relationUpdatedAt: Date | null;
  relationEffectiveFrom: Date | null;
  relationEffectiveTo: Date | null;
  relationVersion: number | null;
  shareRatio: number | null;
  isConsolidated: boolean;
  functionalCurrency: string | null;
  currencyEvidence: string | null;
  currencyDecidedBy: number | null;
}

export interface ConsolidationSourceFact {
  companyId: number;
  reportType: StatementReportType;
  sourceKind: "workpaper" | "system" | "missing";
  sourceStatus: "submitted" | "draft" | "available" | "missing";
  workpaperId: number | null;
  workpaperVersion: number | null;
  sourceChecksum: string | null;
  workpaperUpdatedBy: number | null;
  sourcePackageId: number | null;
  sourcePackageRevision: number | null;
  sourcePackageStatus: string | null;
  sourcePackageChecksum: string | null;
  sourcePackageUploadedBy: number | null;
  sourcePackageSubmittedBy: number | null;
  lineCount: number;
  sourcedLineCount: number;
  importedLineCount: number;
  manualLineCount: number;
  formulaLineCount: number;
  reportPayload: Prisma.InputJsonValue;
  fingerprint: string;
  evidence: string | null;
}

export interface ConsolidationRateFact {
  exchangeRateId: number;
  exchangeRateVersion: number;
  baseCurrency: string;
  quoteCurrency: string;
  rateKind: string;
  rateDate: string;
  rate: Prisma.Decimal;
  sourceUrl: string;
  publishedAt: Date | null;
  recordedBy: number | null;
  recordedAt: Date;
  applications: Prisma.InputJsonValue;
}

function jsonSnapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function successfulFrozenReportPayload(value: Prisma.InputJsonValue) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const status = (value as { httpStatus?: unknown }).httpStatus;
  return typeof status === "number" && status >= 200 && status < 300;
}

function reportTypeForGenerator(reportType: StatementReportType) {
  if (reportType === "balanceSheet") return "balance" as const;
  if (reportType === "incomeStatement") return "income" as const;
  return "cashflow" as const;
}

function normalizedCurrencyCode(sourceCode: string, sourceName: string) {
  const code = sourceCode.trim().toUpperCase();
  if (code === "RMB" || sourceName.includes("人民币")) return "CNY";
  if (/^[A-Z]{3}$/.test(code)) return code;
  if (sourceName.includes("加拿大元") || sourceName.includes("加元")) return "CAD";
  return null;
}

async function generateFrozenReportPayload(
  companyCode: string,
  year: number,
  month: number,
  periodKind: StatementPeriodKind,
  reportType: StatementReportType,
) {
  const response = await generateFinanceReport({
    companyCode,
    year,
    month,
    periodKind,
    reportType: reportTypeForGenerator(reportType),
  });
  const payload = await response.json().catch(() => ({ error: "报表生成结果无法解析" }));
  return jsonSnapshot({
    httpStatus: response.status,
    capturedAt: new Date().toISOString(),
    payload,
  });
}

async function generateMonthlyFlowTranslation(
  companyCode: string,
  year: number,
  month: number,
  reportType: "incomeStatement" | "cashFlow",
) {
  const periodRows = async (targetYear: number) => {
    if (reportType === "incomeStatement") {
      const config = await loadIncomeStatementConfig(companyCode, targetYear);
      const monthlyAmounts = await computeIncomeMonthlySystemAmounts(companyCode, targetYear, month, config);
      return Array.from({ length: month }, (_, index) => {
        const targetMonth = index + 1;
        const lines = buildIncomeLines(config, new Map(), new Map(), monthlyAmounts.get(targetMonth));
        return {
          periodEnd: periodEndDate(targetYear, targetMonth),
          lines: lines.map((line) => ({ lineCode: line.lineCode, amount: line.currentMonthAmount ?? 0 })),
        };
      });
    }
    const config = await loadCashFlowConfig(companyCode, targetYear);
    const monthlyAmounts = await computeCashFlowMonthlySystemAmounts(companyCode, targetYear, month, config);
    return Array.from({ length: month }, (_, index) => {
      const targetMonth = index + 1;
      const amounts = monthlyAmounts.get(targetMonth)?.amounts ?? new Map<string, number>();
      return {
        periodEnd: periodEndDate(targetYear, targetMonth),
        lines: config.map((line) => ({ lineCode: line.lineCode, amount: amounts.get(line.lineCode) ?? 0 })),
      };
    });
  };
  const [current, comparative] = await Promise.all([
    periodRows(year),
    periodRows(year - 1),
  ]);
  return { current, comparative };
}

function retainedEarningsOpeningFact(companyCode: string, year: number) {
  const openingDate = `${year - 1}-12-31`;
  return getTenantProfile().financeConsolidationPolicies?.retainedEarningsOpeningBalances.find((item) => (
    item.foreignCompanyCode === companyCode
    && item.openingDate === openingDate
    && item.presentationCurrencyCode.toUpperCase() === "CNY"
  )) ?? null;
}

interface ConsolidationRelationshipLoadOptions {
  includeAllRelations: boolean;
  strictTopology: boolean;
  requireSubsidiary: boolean;
  inclusionByCompanyId?: ReadonlyMap<number, boolean>;
}

async function loadConsolidationRelationshipFacts(
  parentCompanyId: number,
  asOfDate: string,
  options: ConsolidationRelationshipLoadOptions,
) {
  const asOf = new Date(`${asOfDate}T23:59:59.999Z`);
  const [parent, relations] = await Promise.all([
    prisma.company.findUnique({
      where: { id: parentCompanyId },
      select: { id: true, code: true, party: { select: { name: true, fullName: true } } },
    }),
    prisma.ownershipInterest.findMany({
      where: {
        ...(options.includeAllRelations
          ? { owner: { company: { isNot: null } } }
          : { isConsolidated: true }),
        AND: [
          { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: asOf } }] },
          { OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }] },
        ],
      },
      include: {
        owner: { select: { company: { select: { id: true, code: true } } } },
        issuer: { select: { id: true, code: true, party: { select: { name: true, fullName: true } } } },
      },
      orderBy: [{ ownerPartyId: "asc" }, { issuerCompanyId: "asc" }],
    }),
  ]);
  if (!parent) throw new ConsolidationSnapshotError("母公司不存在", 404);
  const byParent = new Map<number, typeof relations>();
  for (const relation of relations) {
    const ownerCompany = relation.owner.company;
    if (!ownerCompany) throw new ConsolidationSnapshotError("并表股权关系的持股方不是内部公司", 409);
    const rows = byParent.get(ownerCompany.id) ?? [];
    rows.push(relation);
    byParent.set(ownerCompany.id, rows);
  }
  const facts: ConsolidationScopeFact[] = [{
    companyId: parent.id,
    companyCode: parent.code,
    companyName: parent.party.fullName || parent.party.name,
    role: "parent",
    directParentCompanyId: null,
    directParentCode: null,
    relationId: null,
    relationUpdatedAt: null,
    relationEffectiveFrom: null,
    relationEffectiveTo: null,
    relationVersion: null,
    shareRatio: 1,
    isConsolidated: true,
    functionalCurrency: null,
    currencyEvidence: null,
    currencyDecidedBy: null,
  }];
  const ownerByCompany = new Map<number, number>();
  const visit = (currentParentId: number, path: Set<number>) => {
    for (const relation of byParent.get(currentParentId) ?? []) {
      const ownerCompany = relation.owner.company;
      if (!ownerCompany) throw new ConsolidationSnapshotError("并表股权关系的持股方不是内部公司", 409);
      const included = options.inclusionByCompanyId?.get(relation.issuerCompanyId)
        ?? relation.isConsolidated;
      if (options.strictTopology && !included) continue;
      if (path.has(relation.issuerCompanyId)) {
        if (options.strictTopology) throw new ConsolidationSnapshotError("并表公司关系存在循环持股，不能创建批次", 409);
        continue;
      }
      const existingOwner = ownerByCompany.get(relation.issuerCompanyId);
      if (existingOwner && existingOwner !== ownerCompany.id) {
        if (options.strictTopology) {
          throw new ConsolidationSnapshotError("同一并表公司存在多个直接持股方，需先确认法律持股链路", 409);
        }
        continue;
      }
      if (existingOwner) continue;
      ownerByCompany.set(relation.issuerCompanyId, ownerCompany.id);
      facts.push({
        companyId: relation.issuer.id,
        companyCode: relation.issuer.code,
        companyName: relation.issuer.party.fullName || relation.issuer.party.name,
        role: "subsidiary",
        directParentCompanyId: ownerCompany.id,
        directParentCode: ownerCompany.code,
        relationId: relation.id,
        relationUpdatedAt: relation.updatedAt,
        relationEffectiveFrom: relation.effectiveFrom,
        relationEffectiveTo: relation.effectiveTo,
        relationVersion: relation.version,
        shareRatio: relation.shareRatio,
        isConsolidated: included,
        functionalCurrency: null,
        currencyEvidence: null,
        currencyDecidedBy: null,
      });
      visit(relation.issuerCompanyId, new Set([...path, relation.issuerCompanyId]));
    }
  };
  visit(parentCompanyId, new Set([parentCompanyId]));
  if (options.requireSubsidiary && facts.length === 1) {
    throw new ConsolidationSnapshotError("母公司没有已标记并表的子公司", 409);
  }
  const [baseCurrencies, currencyPolicies] = await Promise.all([
    prisma.financeCurrency.findMany({
      where: { companyCode: { in: facts.map((fact) => fact.companyCode) }, isBase: true },
      select: {
        companyCode: true,
        sourceSystem: true,
        sourceLedger: true,
        sourceCode: true,
        sourceName: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    }),
    prisma.financeCompanyCurrencyPolicy.findMany({
      where: {
        companyId: { in: facts.map((fact) => fact.companyId) },
        OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: asOf } }],
      },
      select: {
        companyId: true, currency: { select: { code: true } }, source: true,
        evidence: true, updatedAt: true,
      },
    }),
  ]);
  const baseCurrencyByCompany = new Map<string, typeof baseCurrencies[number]>();
  for (const currency of baseCurrencies) {
    if (!baseCurrencyByCompany.has(currency.companyCode)) baseCurrencyByCompany.set(currency.companyCode, currency);
  }
  const currencyPolicyByCompanyId = new Map(currencyPolicies.map((policy) => [policy.companyId, policy]));
  for (const fact of facts) {
    const policy = currencyPolicyByCompanyId.get(fact.companyId);
    if (policy) {
      fact.functionalCurrency = policy.currency.code.trim().toUpperCase();
      fact.currencyEvidence = `公司财务本位币政策：${policy.source}；${policy.evidence}；更新于 ${policy.updatedAt.toISOString()}`;
      continue;
    }
    const currency = baseCurrencyByCompany.get(fact.companyCode);
    if (!currency) continue;
    fact.functionalCurrency = normalizedCurrencyCode(currency.sourceCode, currency.sourceName);
    fact.currencyEvidence = fact.functionalCurrency
      ? `ERP本位币主数据：${currency.sourceSystem}/${currency.sourceLedger} ${currency.sourceCode} ${currency.sourceName}，抓取于 ${currency.updatedAt.toISOString()}`
      : null;
  }
  return facts;
}

export function loadConsolidationScopeFacts(parentCompanyId: number, asOfDate: string) {
  return loadConsolidationRelationshipFacts(parentCompanyId, asOfDate, {
    includeAllRelations: false,
    strictTopology: true,
    requireSubsidiary: true,
  });
}

export function loadConsolidationCandidateFacts(parentCompanyId: number, asOfDate: string) {
  return loadConsolidationRelationshipFacts(parentCompanyId, asOfDate, {
    includeAllRelations: true,
    strictTopology: false,
    requireSubsidiary: false,
  });
}

export function loadConsolidationScopeFactsWithOverrides(
  parentCompanyId: number,
  asOfDate: string,
  inclusionByCompanyId: ReadonlyMap<number, boolean>,
) {
  return loadConsolidationRelationshipFacts(parentCompanyId, asOfDate, {
    includeAllRelations: true,
    strictTopology: true,
    requireSubsidiary: false,
    inclusionByCompanyId,
  });
}

async function loadSourceFact(
  scope: ConsolidationScopeFact,
  year: number,
  month: number,
  periodKind: StatementPeriodKind,
  reportType: StatementReportType,
  readiness: ConsolidationEntitySourceReadiness,
  existing?: ConsolidationSourceFact,
): Promise<ConsolidationSourceFact> {
  const reportReadiness = readiness.reports[reportType];
  const selectedCutoverBaseline = reportType === "balanceSheet"
    && scope.functionalCurrency?.toUpperCase() === "CAD"
    ? selectedConsolidationCutoverBaseline(scope.companyCode, year, month)
    : null;
  const cutoverBaselineChanged = (selectedCutoverBaseline?.key ?? null) !== frozenCutoverBaselineKey(existing);
  if (readiness.periodClosed
    && existing
    && existing.sourceKind !== "missing"
    && existing.sourceStatus !== "missing"
    && !cutoverBaselineChanged) {
    return existing;
  }
  const systemCount = reportReadiness.count;
  const baseReportPayload = reportReadiness.ready
    ? await generateFrozenReportPayload(scope.companyCode, year, month, periodKind, reportType)
    : jsonSnapshot({ capturedAt: new Date().toISOString(), payload: { type: reportType, source: "missing", lines: [] } });
  const reportPayload = reportReadiness.ready
    ? jsonSnapshot({
        ...(baseReportPayload as Record<string, unknown>),
        translationFacts: {
          ...(reportType === "incomeStatement" || reportType === "cashFlow"
            ? { monthlyFlows: await generateMonthlyFlowTranslation(scope.companyCode, year, month, reportType) }
            : {}),
          ...(reportType === "balanceSheet" && scope.functionalCurrency?.toUpperCase() === "CAD"
            ? {
                retainedEarningsOpening: retainedEarningsOpeningFact(scope.companyCode, year),
                consolidationCutoverBaseline: await consolidationCutoverBaselineFact(
                  scope.companyCode, year, month,
                ),
              }
            : {}),
        },
      })
    : baseReportPayload;
  const reportReady = reportReadiness.ready && successfulFrozenReportPayload(reportPayload);
  const sourceKind: ConsolidationSourceFact["sourceKind"] = reportReady ? "system" : "missing";
  const sourceStatus: ConsolidationSourceFact["sourceStatus"] = reportReady ? "available" : "missing";
  const snapshot = {
    companyId: scope.companyId,
    reportType,
    sourceKind,
    sourceStatus,
    workpaperId: null,
    workpaperVersion: null,
    sourceChecksum: null,
    workpaperUpdatedBy: null,
    sourcePackageId: null,
    sourcePackageRevision: null,
    sourcePackageStatus: null,
    sourcePackageChecksum: null,
    sourcePackageUploadedBy: null,
    sourcePackageSubmittedBy: null,
    lineCount: systemCount,
    sourcedLineCount: systemCount,
    importedLineCount: 0,
    manualLineCount: 0,
    formulaLineCount: 0,
    reportPayload,
    evidence: `系统自动快照：${reportReady ? reportReadiness.detail : reportReadiness.ready ? "报表生成未成功，等待下次打开草稿自动重试" : reportReadiness.detail}`,
  };
  return { ...snapshot, fingerprint: consolidationSourceFactFingerprint(snapshot) };
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index]!);
      }
    },
  ));
  return results;
}

export async function loadInitialSourceFacts(
  scope: ConsolidationScopeFact[],
  year: number,
  month: number,
  periodKind: StatementPeriodKind,
) {
  const readiness = await loadConsolidationSourceReadiness({
    companyCodes: scope.map((entity) => entity.companyCode),
    year,
    month,
    periodKind,
  });
  const targets = scope.flatMap((entity) => REPORT_TYPES.map((reportType) => ({ entity, reportType })));
  return mapWithConcurrency(targets, 2, ({ entity, reportType }) =>
    loadSourceFact(entity, year, month, periodKind, reportType, readiness.byCompany.get(entity.companyCode)!));
}

export async function loadSelectedSourceFacts(
  scopeBySnapshotId: Map<number, ConsolidationScopeFact>,
  year: number,
  month: number,
  periodKind: StatementPeriodKind,
  existingSources: readonly ConsolidationSourceFact[] = [],
) {
  const companyCodes = [...new Set([...scopeBySnapshotId.values()].map((entity) => entity.companyCode))];
  const readiness = await loadConsolidationSourceReadiness({ companyCodes, year, month, periodKind });
  const existingByCompanyAndType = new Map(
    existingSources.map((source) => [`${source.companyId}:${source.reportType}`, source]),
  );
  const targets = [...scopeBySnapshotId.values()].flatMap((scope) =>
    REPORT_TYPES.map((reportType) => ({ scope, reportType })));
  return mapWithConcurrency(targets, 2, ({ scope, reportType }) => loadSourceFact(
    scope,
    year,
    month,
    periodKind,
    reportType,
    readiness.byCompany.get(scope.companyCode)!,
    existingByCompanyAndType.get(`${scope.companyId}:${reportType}`),
  ));
}

export async function loadAvailableRateFacts(
  periodEnd: string,
  exchangeRateIds?: number[],
): Promise<ConsolidationRateFact[]> {
  const rows = await prisma.financeStatementExchangeRate.findMany({
    where: exchangeRateIds
      ? {
          id: { in: exchangeRateIds },
          baseCurrency: "CAD",
          quoteCurrency: "CNY",
          rateKind: { in: ["centralParity", "monthlyAverage", "historicalInvestment", "historicalCapitalAmount"] },
          rateDate: { lte: periodEnd },
        }
      : {
          baseCurrency: "CAD",
          quoteCurrency: "CNY",
          rateKind: "centralParity",
          rateDate: { lte: periodEnd },
        },
    orderBy: [{ rateDate: "desc" }, { version: "desc" }],
    take: 200,
  });
  if (exchangeRateIds && rows.length !== exchangeRateIds.length) {
    throw new ConsolidationSnapshotError("只能冻结当前期间可用的汇率证据版本", 409);
  }
  return rows.map((row) => ({
    exchangeRateId: row.id,
    exchangeRateVersion: row.version,
    baseCurrency: row.baseCurrency,
    quoteCurrency: row.quoteCurrency,
    rateKind: row.rateKind,
    rateDate: row.rateDate,
    rate: row.rate,
    sourceUrl: row.sourceUrl,
    publishedAt: row.publishedAt,
    recordedBy: row.updatedBy,
    recordedAt: row.capturedAt,
    applications: [],
  }));
}

export function periodEndDate(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}
