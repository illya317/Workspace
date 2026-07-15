import type {
  ConsolidationSourceSelectionInput,
  StatementReportType,
} from "@workspace/finance/types";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { consolidationSourceFactFingerprint } from "./consolidation-fingerprints";
import { consolidationSourceIdentityMatches } from "./consolidation-source-identity";
import { generateFinanceReport } from "./report-generator";

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
  verifiedBy: number | null;
  verifiedAt: Date | null;
  applications: Prisma.InputJsonValue;
}

function jsonSnapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function reportTypeForGenerator(reportType: StatementReportType) {
  if (reportType === "balanceSheet") return "balance" as const;
  if (reportType === "incomeStatement") return "income" as const;
  return "cashflow" as const;
}

async function generateFrozenReportPayload(
  companyCode: string,
  year: number,
  month: number,
  reportType: StatementReportType,
) {
  const response = await generateFinanceReport({
    companyCode,
    year,
    month,
    reportType: reportTypeForGenerator(reportType),
  });
  const payload = await response.json().catch(() => ({ error: "报表生成结果无法解析" }));
  return jsonSnapshot({
    httpStatus: response.status,
    capturedAt: new Date().toISOString(),
    payload,
  });
}

export async function loadConsolidationScopeFacts(parentCompanyId: number, asOfDate: string) {
  const asOf = new Date(`${asOfDate}T23:59:59.999Z`);
  const [parent, relations] = await Promise.all([
    prisma.company.findUnique({
      where: { id: parentCompanyId },
      select: { id: true, code: true, name: true, fullName: true },
    }),
    prisma.companyRelation.findMany({
      where: {
        isConsolidated: true,
        AND: [
          { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: asOf } }] },
          { OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }] },
        ],
      },
      include: {
        parent: { select: { id: true, code: true } },
        child: { select: { id: true, code: true, name: true, fullName: true } },
      },
      orderBy: [{ parentId: "asc" }, { childId: "asc" }],
    }),
  ]);
  if (!parent) throw new ConsolidationSnapshotError("母公司不存在", 404);
  const byParent = new Map<number, typeof relations>();
  for (const relation of relations) {
    const rows = byParent.get(relation.parentId) ?? [];
    rows.push(relation);
    byParent.set(relation.parentId, rows);
  }
  const facts: ConsolidationScopeFact[] = [{
    companyId: parent.id,
    companyCode: parent.code,
    companyName: parent.fullName || parent.name,
    role: "parent",
    directParentCompanyId: null,
    directParentCode: null,
    relationId: null,
    relationUpdatedAt: null,
    relationEffectiveFrom: null,
    relationEffectiveTo: null,
    relationVersion: null,
    shareRatio: 1,
    functionalCurrency: null,
    currencyEvidence: null,
    currencyDecidedBy: null,
  }];
  const ownerByCompany = new Map<number, number>();
  const visit = (currentParentId: number, path: Set<number>) => {
    for (const relation of byParent.get(currentParentId) ?? []) {
      if (path.has(relation.childId)) throw new ConsolidationSnapshotError("并表公司关系存在循环持股，不能创建批次", 409);
      const existingOwner = ownerByCompany.get(relation.childId);
      if (existingOwner && existingOwner !== relation.parentId) {
        throw new ConsolidationSnapshotError("同一并表公司存在多个直接持股方，需先确认法律持股链路", 409);
      }
      if (existingOwner) continue;
      ownerByCompany.set(relation.childId, relation.parentId);
      facts.push({
        companyId: relation.child.id,
        companyCode: relation.child.code,
        companyName: relation.child.fullName || relation.child.name,
        role: "subsidiary",
        directParentCompanyId: relation.parent.id,
        directParentCode: relation.parent.code,
        relationId: relation.id,
        relationUpdatedAt: relation.updatedAt,
        relationEffectiveFrom: relation.effectiveFrom,
        relationEffectiveTo: relation.effectiveTo,
        relationVersion: relation.version,
        shareRatio: relation.shareRatio,
        functionalCurrency: null,
        currencyEvidence: null,
        currencyDecidedBy: null,
      });
      visit(relation.childId, new Set([...path, relation.childId]));
    }
  };
  visit(parentCompanyId, new Set([parentCompanyId]));
  if (facts.length === 1) throw new ConsolidationSnapshotError("母公司没有已标记并表的子公司", 409);
  return facts;
}

function workpaperStats(workpaper: {
  id: number;
  version: number;
  status: string;
  lines: { manualAmount: number; importedAmount: number; formulaText: string | null; source: string | null }[];
  updatedBy: number | null;
  sourceChecksum: string | null;
  sourcePackageId: number | null;
  sourcePackageRevision: number | null;
  sourcePackage: {
    id: number;
    revision: number;
    status: string;
    fileChecksum: string;
    uploadedBy: number;
    submittedBy: number | null;
  } | null;
} | null) {
  if (!workpaper) return {
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
    lineCount: 0,
    sourcedLineCount: 0,
    importedLineCount: 0,
    manualLineCount: 0,
    formulaLineCount: 0,
  };
  return {
    workpaperId: workpaper.id,
    workpaperVersion: workpaper.version,
    sourceChecksum: workpaper.sourceChecksum,
    workpaperUpdatedBy: workpaper.updatedBy,
    sourcePackageId: workpaper.sourcePackageId,
    sourcePackageRevision: workpaper.sourcePackageRevision,
    sourcePackageStatus: workpaper.sourcePackage?.status ?? null,
    sourcePackageChecksum: workpaper.sourcePackage?.fileChecksum ?? null,
    sourcePackageUploadedBy: workpaper.sourcePackage?.uploadedBy ?? null,
    sourcePackageSubmittedBy: workpaper.sourcePackage?.submittedBy ?? null,
    lineCount: workpaper.lines.length,
    sourcedLineCount: workpaper.lines.filter((line) => Boolean(line.source?.trim())).length,
    importedLineCount: workpaper.lines.filter((line) => Math.abs(line.importedAmount) > 0.005).length,
    manualLineCount: workpaper.lines.filter((line) => Math.abs(line.manualAmount) > 0.005).length,
    formulaLineCount: workpaper.lines.filter((line) => Boolean(line.formulaText?.trim())).length,
  };
}

async function loadSourceFact(
  scope: ConsolidationScopeFact,
  year: number,
  month: number,
  reportType: StatementReportType,
  selection?: ConsolidationSourceSelectionInput,
): Promise<ConsolidationSourceFact> {
  const workpaper = selection?.workpaperId
    ? await prisma.financeStatementWorkpaper.findUnique({
        where: { id: selection.workpaperId },
        include: {
          lines: true,
          sourcePackage: {
            select: {
              id: true,
              revision: true,
              status: true,
              fileChecksum: true,
              uploadedBy: true,
              submittedBy: true,
            },
          },
        },
      })
    : await prisma.financeStatementWorkpaper.findUnique({
        where: { companyCode_year_month_reportType: { companyCode: scope.companyCode, year, month, reportType } },
        include: {
          lines: true,
          sourcePackage: {
            select: {
              id: true,
              revision: true,
              status: true,
              fileChecksum: true,
              uploadedBy: true,
              submittedBy: true,
            },
          },
        },
      });
  if (selection?.workpaperId && (!workpaper
    || workpaper.companyCode !== scope.companyCode
    || workpaper.year !== year
    || workpaper.month !== month
    || workpaper.reportType !== reportType)) {
    throw new ConsolidationSnapshotError("所选底稿不属于当前合并实体、期间或报表类型", 409);
  }
  if (selection && !selection.workpaperId && workpaper) {
    throw new ConsolidationSnapshotError("当前期间已有报表底稿，不能绕过底稿改选系统账；请先提交或修订底稿", 409);
  }
  const period = await prisma.financePeriod.findFirst({
    where: { companyCode: scope.companyCode, year, month },
    select: { _count: { select: { balances: true, vouchers: true, cashFlowAllocations: true } } },
  });
  const systemCount = reportType === "balanceSheet"
    ? period?._count.balances ?? 0
    : reportType === "incomeStatement"
      ? period?._count.vouchers ?? 0
      : period?._count.cashFlowAllocations ?? 0;
  const useWorkpaper = Boolean(selection?.workpaperId || (!selection && workpaper));
  const sourceKind: ConsolidationSourceFact["sourceKind"] = useWorkpaper
    ? "workpaper"
    : systemCount > 0 ? "system" : "missing";
  const sourceStatus: ConsolidationSourceFact["sourceStatus"] = useWorkpaper
    ? workpaper?.status === "submitted" ? "submitted" : "draft"
    : systemCount > 0 ? "available" : "missing";
  const stats = workpaperStats(useWorkpaper ? workpaper : null);
  const reportPayload = sourceKind === "missing"
    ? jsonSnapshot({ capturedAt: new Date().toISOString(), payload: { type: reportType, source: "missing", lines: [] } })
    : await generateFrozenReportPayload(scope.companyCode, year, month, reportType);
  const evidence = selection?.evidence?.trim() || null;
  const snapshot = {
    companyId: scope.companyId,
    reportType,
    sourceKind,
    sourceStatus,
    ...stats,
    reportPayload,
    evidence,
  };
  return { ...snapshot, fingerprint: consolidationSourceFactFingerprint(snapshot) };
}

export async function loadInitialSourceFacts(
  scope: ConsolidationScopeFact[],
  year: number,
  month: number,
) {
  return Promise.all(scope.flatMap((entity) => REPORT_TYPES.map((reportType) =>
    loadSourceFact(entity, year, month, reportType),
  )));
}

export async function loadSelectedSourceFacts(
  scopeBySnapshotId: Map<number, ConsolidationScopeFact>,
  year: number,
  month: number,
  selections: ConsolidationSourceSelectionInput[],
) {
  return Promise.all(selections.map((selection) => {
    const scope = scopeBySnapshotId.get(selection.entitySnapshotId);
    if (!scope) throw new ConsolidationSnapshotError("个别报表来源引用了批次外实体", 409);
    return loadSourceFact(scope, year, month, selection.reportType, selection);
  }));
}

export async function assertConsolidationSourceFactsCurrent(
  tx: Prisma.TransactionClient,
  sources: readonly ConsolidationSourceFact[],
  context: {
    year: number;
    month: number;
    companyCodeByCompanyId: ReadonlyMap<number, string>;
  },
) {
  for (const source of sources) {
    const companyCode = context.companyCodeByCompanyId.get(source.companyId);
    if (!companyCode) {
      throw new ConsolidationSnapshotError("来源快照引用了合并范围外公司", 409);
    }
    const current = await tx.financeStatementWorkpaper.findUnique({
      where: {
        companyCode_year_month_reportType: {
          companyCode,
          year: context.year,
          month: context.month,
          reportType: source.reportType,
        },
      },
      include: {
        sourcePackage: {
          select: {
            id: true,
            revision: true,
            status: true,
            fileChecksum: true,
          },
        },
      },
    });
    if (!source.workpaperId) {
      if (current) {
        throw new ConsolidationSnapshotError("底稿在快照生成期间新增，请刷新后重新选择来源", 409);
      }
      continue;
    }
    if (!consolidationSourceIdentityMatches(source, current)) {
      throw new ConsolidationSnapshotError("底稿或来源包在快照生成期间发生变化，请刷新后重试", 409);
    }
  }
}

export async function loadVerifiedRateFacts(
  periodEnd: string,
  exchangeRateIds?: number[],
): Promise<ConsolidationRateFact[]> {
  const rows = await prisma.financeStatementExchangeRate.findMany({
    where: exchangeRateIds
      ? {
          id: { in: exchangeRateIds },
          status: "verified",
          baseCurrency: "CAD",
          quoteCurrency: "CNY",
          rateDate: { lte: periodEnd },
        }
      : {
          status: "verified",
          baseCurrency: "CAD",
          quoteCurrency: "CNY",
          rateDate: { lte: periodEnd },
        },
    orderBy: [{ rateDate: "desc" }, { version: "desc" }],
    take: 200,
  });
  if (exchangeRateIds && rows.length !== exchangeRateIds.length) {
    throw new ConsolidationSnapshotError("只能冻结已经独立复核的汇率证据版本", 409);
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
    verifiedBy: row.verifiedBy,
    verifiedAt: row.verifiedAt,
    applications: [],
  }));
}

export function periodEndDate(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}
