import type {
  ConsolidationEliminationPackage,
  ConsolidationEntityCoverage,
  ConsolidationOverview,
  ConsolidationPeriodOption,
  ConsolidationReadinessCheck,
  StatementExchangeRateSnapshot,
  StatementSourceCoverage,
} from "@workspace/finance/types";
import { serviceError, type ServiceResult } from "@workspace/platform/server/api";
import { prisma } from "@workspace/platform/server/prisma";
import { CONSOLIDATION_BATCH_INCLUDE, consolidationBatchSnapshot } from "./consolidation-dto";
import { parseConsolidationRateApplications } from "./consolidation-rate-applications";
import {
  comparativeEntitySnapshotIds,
  comparativePeriodEndDate,
} from "./consolidation-comparative";
import { loadConsolidationScopeFacts, periodEndDate } from "./consolidation-snapshots";
import { statementExchangeRateSnapshot } from "./exchange-rates";

interface ConsolidationOverviewInput {
  year?: number;
  month?: number;
  parentCompanyId?: number;
  batchId?: number;
}

const REPORT_TYPES = ["balanceSheet", "incomeStatement", "cashFlow"] as const;

function periodKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function isClosingRateNearPeriodEnd(rateDate: string, closingDate: string) {
  const difference = (Date.parse(`${closingDate}T00:00:00Z`) - Date.parse(`${rateDate}T00:00:00Z`)) / 86_400_000;
  return difference >= 0 && difference <= 7;
}

function consolidationScopeErrorMessage(cause: unknown) {
  const code = cause && typeof cause === "object" && "code" in cause
    ? String((cause as { code?: unknown }).code ?? "")
    : "";
  if (code === "P2021" || code === "P2022") {
    return "合并范围数据结构尚未完成当前版本迁移，请联系系统管理员完成数据库迁移后重试";
  }
  return "合并范围读取失败，请核对公司关系数据后重试";
}

function liveSourceCoverage(
  workpaper: {
    id: number;
    version: number;
    status: string;
    lines: { manualAmount: number; importedAmount: number; formulaText: string | null; source: string | null }[];
  } | undefined,
  systemCount: number,
): StatementSourceCoverage {
  if (workpaper) {
    const submitted = workpaper.status === "submitted";
    return {
      kind: "workpaper",
      status: submitted ? "submitted" : "draft",
      label: submitted ? "已提交底稿" : "底稿草稿",
      detail: `${workpaper.lines.length} 行 · ${workpaper.lines.filter((line) => Boolean(line.source?.trim())).length} 行有来源`,
      lineCount: workpaper.lines.length,
      sourcedLineCount: workpaper.lines.filter((line) => Boolean(line.source?.trim())).length,
      manualLineCount: workpaper.lines.filter((line) => Math.abs(line.manualAmount) > 0.005).length,
      importedLineCount: workpaper.lines.filter((line) => Math.abs(line.importedAmount) > 0.005).length,
      formulaLineCount: workpaper.lines.filter((line) => Boolean(line.formulaText?.trim())).length,
      workpaperId: workpaper.id,
      workpaperVersion: workpaper.version,
    };
  }
  if (systemCount > 0) return {
    kind: "system",
    status: "available",
    label: "系统账回退",
    detail: `${systemCount} 条期间事实；需冻结报表结果并记录接受依据`,
    lineCount: 0,
    sourcedLineCount: 0,
    manualLineCount: 0,
    importedLineCount: 0,
    formulaLineCount: 0,
  };
  return {
    kind: "missing",
    status: "missing",
    label: "缺少来源",
    detail: "当前期间既无底稿，也无可用系统账事实",
    lineCount: 0,
    sourcedLineCount: 0,
    manualLineCount: 0,
    importedLineCount: 0,
    formulaLineCount: 0,
  };
}

function frozenSourceCoverage(source: {
  id: number;
  sourceKind: string;
  sourceStatus: string;
  workpaperId: number | null;
  workpaperVersion: number | null;
  lineCount: number;
  sourcedLineCount: number;
  manualLineCount: number;
  importedLineCount: number;
  formulaLineCount: number;
  fingerprint: string;
  evidence: string | null;
} | undefined): StatementSourceCoverage {
  if (!source) return liveSourceCoverage(undefined, 0);
  const kind = source.sourceKind as StatementSourceCoverage["kind"];
  const status = source.sourceStatus as StatementSourceCoverage["status"];
  return {
    snapshotId: source.id,
    kind,
    status,
    label: kind === "workpaper" ? status === "submitted" ? "已冻结底稿" : "已冻结底稿草稿" : kind === "system" ? "已冻结系统账" : "缺少来源",
    detail: kind === "workpaper"
      ? `底稿 #${source.workpaperId} · v${source.workpaperVersion} · ${source.lineCount} 行`
      : kind === "system" ? source.evidence || "系统账快照尚缺接受依据" : "批次未冻结可用报表",
    lineCount: source.lineCount,
    sourcedLineCount: source.sourcedLineCount,
    manualLineCount: source.manualLineCount,
    importedLineCount: source.importedLineCount,
    formulaLineCount: source.formulaLineCount,
    workpaperId: source.workpaperId,
    workpaperVersion: source.workpaperVersion,
    fingerprint: source.fingerprint,
    evidence: source.evidence,
  };
}

function entityStatus(entity: Pick<ConsolidationEntityCoverage, "balanceSheet" | "incomeStatement" | "cashFlow" | "role" | "shareRatio">) {
  if (entity.role === "子公司" && (entity.shareRatio === null || entity.shareRatio <= 0 || entity.shareRatio > 1)) return "blocked" as const;
  const sources = [entity.balanceSheet, entity.incomeStatement, entity.cashFlow];
  if (sources.some((source) => source.kind === "missing")) return "blocked" as const;
  if (sources.some((source) => (source.kind === "system" && !source.evidence) || source.status === "draft")) return "attention" as const;
  return "ready" as const;
}

function resolution(
  batchId: number | null,
  key: string,
  batchStatus?: string,
): ConsolidationReadinessCheck["resolution"] {
  const batchTarget = batchId ? `/api/modules/finance/statements/consolidation/batches/${batchId}` : "/api/modules/finance/statements/consolidation/batches";
  if (key === "scope" || key === "ownership") return {
    ownerModule: "hr" as const,
    actionKey: "hr.roster.companyRelation.update",
    target: "/hr/roster",
  };
  if (key === "fx") return {
    ownerModule: "finance",
    actionKey: "finance.statements.exchangeRate.save",
    target: "/api/modules/finance/statements/consolidation/exchange-rates",
  };
  if (!batchId) return {
    ownerModule: "finance",
    actionKey: "finance.statements.consolidationBatch.ensure",
    target: batchTarget,
  };
  if (key === "sources") return {
    ownerModule: "finance",
    actionKey: "finance.statements.consolidationSources.save",
    target: `${batchTarget}/sources`,
  };
  if (key === "eliminations") return {
    ownerModule: "finance",
    actionKey: "finance.statements.consolidationEntry.save",
    target: `${batchTarget}/entries`,
  };
  if (key === "tax") return {
    ownerModule: "finance",
    actionKey: "finance.statements.consolidationControl.resolve",
    target: `${batchTarget}/control-decisions`,
  };
  const lifecycle = batchStatus === "submitted"
    ? "review"
    : batchStatus === "reviewed"
      ? "lock"
      : batchStatus === "locked"
        ? "publish"
        : "submit";
  return {
    ownerModule: "finance",
    actionKey: `finance.statements.consolidationBatch.${lifecycle}`,
    target: `${batchTarget}/${lifecycle}`,
  };
}

function packageStatus(entries: { entryType: string; status: string }[], entryType: string) {
  const rows = entries.filter((entry) => entry.entryType === entryType);
  if (rows.some((entry) => entry.status === "approved")) return "approved" as const;
  if (rows.some((entry) => entry.status === "submitted")) return "submitted" as const;
  if (rows.length > 0) return "draft" as const;
  return "notStarted" as const;
}

function eliminationPackages(
  batch: Awaited<ReturnType<typeof loadBatch>>,
): ConsolidationEliminationPackage[] {
  const entries = batch?.entries ?? [];
  const decisionKeys = new Set(batch?.controlDecisions
    .filter((decision) => decision.decision === "notApplicable")
    .map((decision) => decision.controlKey) ?? []);
  const item = (
    key: string,
    label: string,
    description: string,
    workpaper: ConsolidationEliminationPackage["workpaper"],
    requiredEvidence: string,
    reviewCheck: string,
    entryType: string,
  ): ConsolidationEliminationPackage => {
    const status = packageStatus(entries, entryType);
    const entryCount = entries.filter((entry) => entry.entryType === entryType).length;
    return { key, label, description, workpaper, requiredEvidence, reviewCheck, status: status === "notStarted" && decisionKeys.has(`elimination:${entryType}`) ? "sourceReady" : status, entryCount };
  };
  const taxCount = entries.reduce((sum, entry) => sum + entry.taxEffects.length, 0);
  return [
    item("investment-equity", "长期股权投资与子公司权益", "抵销母公司投资与子公司归属于合并前的权益。", "investmentEquity", "投资协议、出资凭证、子公司权益变动表", "投资成本、购买日净资产与合并商誉/差额勾稽", "investmentEquity"),
    item("non-controlling-interest", "少数股东权益与损益", "按持股链路和归属期间拆分少数股东权益及损益。", "investmentEquity", "持股比例、章程、权益变动", "期初、本期增减、期末及少数股东损益滚动一致", "nonControllingInterest"),
    item("intercompany-balances", "内部往来、借款与减值", "核对并抵销应收应付、借款及相关减值。", "balancesTransactions", "双方余额、对账单、账龄和减值明细", "债权债务、利息及减值准备成对相等", "intercompanyBalance"),
    item("internal-trading", "内部交易与存货未实现损益", "抵销内部收入成本及期末存货未实现利润。", "balancesTransactions", "内部销售明细、毛利率、存货去向", "交易抵销与未实现损益滚动一致", "internalTrading"),
    item("internal-long-term-assets", "内部长期资产交易", "抵销长期资产内部交易损益并调整折旧摊销。", "balancesTransactions", "资产卡片、内部处置凭证、剩余年限", "原值、累计折旧摊销及处置损益连续滚动", "internalLongTermAsset"),
    item("income-dividend", "投资收益、利息与股利", "抵销内部利息、股利和投资收益。", "balancesTransactions", "利息台账、利润分配决议、收付款凭证", "收入费用及应收应付两侧同时抵销", "incomeDividend"),
    item("cash-flow", "内部现金流", "抵销合并主体之间的内部现金收付。", "cashFlow", "双方现金流项目、银行流水和抵销分录", "现金流分类两侧匹配且净变动勾稽", "cashFlow"),
    {
      key: "tax",
      label: "抵销产生的所得税影响",
      description: "按可抵扣/应纳税暂时性差异计算递延所得税。",
      workpaper: "tax",
      requiredEvidence: "抵销分录、税率依据、转回期间和可抵扣性判断",
      reviewCheck: "暂时性差异乘适用税率，并与递延所得税科目勾稽",
      status: taxCount > 0 ? batch?.status === "reviewed" || batch?.status === "locked" || batch?.status === "published" ? "approved" : "draft" : decisionKeys.has("tax") ? "sourceReady" : "notStarted",
      entryCount: taxCount,
    },
  ];
}

async function loadBatch(input: ConsolidationOverviewInput) {
  if (input.batchId) return prisma.financeConsolidationBatch.findUnique({
    where: { id: input.batchId },
    include: CONSOLIDATION_BATCH_INCLUDE,
  });
  if (!input.parentCompanyId || !input.year || !input.month) return null;
  return prisma.financeConsolidationBatch.findFirst({
    where: { parentCompanyId: input.parentCompanyId, year: input.year, month: input.month },
    include: CONSOLIDATION_BATCH_INCLUDE,
    orderBy: { version: "desc" },
  });
}

export async function loadConsolidationOverview(
  input: ConsolidationOverviewInput = {},
): Promise<ConsolidationOverview | ServiceResult<never>> {
  const requestedBatch = await loadBatch(input);
  if (input.batchId && !requestedBatch) return serviceError("合并批次不存在", 404);
  if (requestedBatch && (
    input.parentCompanyId && input.parentCompanyId !== requestedBatch.parentCompanyId
    || input.year && input.year !== requestedBatch.year
    || input.month && input.month !== requestedBatch.month
  )) {
    return serviceError("batchId 与母公司或期间参数不一致", 409);
  }
  let parentCompanyId = requestedBatch?.parentCompanyId ?? input.parentCompanyId ?? null;
  if (!parentCompanyId) {
    const consolidatedRelations = await prisma.companyRelation.findMany({
      where: { isConsolidated: true },
      select: { parentId: true },
    });
    const childCounts = new Map<number, number>();
    for (const relation of consolidatedRelations) {
      childCounts.set(relation.parentId, (childCounts.get(relation.parentId) ?? 0) + 1);
    }
    parentCompanyId = [...childCounts].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
  }
  const now = new Date();
  const scopeAsOf = periodEndDate(
    input.year ?? requestedBatch?.year ?? now.getFullYear(),
    input.month ?? requestedBatch?.month ?? now.getMonth() + 1,
  );
  let scopeError: string | null = null;
  const liveScope = parentCompanyId && !requestedBatch
    ? await loadConsolidationScopeFacts(parentCompanyId, scopeAsOf).catch((cause: unknown) => {
        console.error("Failed to load consolidation scope facts", cause);
        scopeError = consolidationScopeErrorMessage(cause);
        return [];
      })
    : [];
  const companyCodes = requestedBatch
    ? requestedBatch.entities.map((entity) => entity.companyCode)
    : liveScope.map((entity) => entity.companyCode);
  const [factPeriods, workpaperPeriods] = companyCodes.length > 0 ? await Promise.all([
    prisma.financePeriod.findMany({
      where: { companyCode: { in: companyCodes }, OR: [{ balances: { some: {} } }, { vouchers: { some: {} } }, { cashFlowAllocations: { some: {} } }] },
      select: { year: true, month: true },
    }),
    prisma.financeStatementWorkpaper.findMany({ where: { companyCode: { in: companyCodes } }, select: { year: true, month: true } }),
  ]) : [[], []];
  const periodMap = new Map<string, ConsolidationPeriodOption>();
  for (const period of [...factPeriods, ...workpaperPeriods]) periodMap.set(periodKey(period.year, period.month), { ...period, label: `${period.year}年${period.month}月` });
  const availablePeriods = [...periodMap.values()].sort((left, right) => right.year - left.year || right.month - left.month);
  const selectedPeriod = requestedBatch
    ? { year: requestedBatch.year, month: requestedBatch.month }
    : input.year && input.month ? { year: input.year, month: input.month }
      : availablePeriods.find((period) => period.year < now.getFullYear() || period.year === now.getFullYear() && period.month <= now.getMonth() + 1)
        ?? availablePeriods[0] ?? { year: now.getFullYear(), month: 12 };
  const selectedPeriodEnd = periodEndDate(selectedPeriod.year, selectedPeriod.month);
  const [periodFacts, workpapers] = companyCodes.length > 0 ? await Promise.all([
    prisma.financePeriod.findMany({
      where: { companyCode: { in: companyCodes }, year: selectedPeriod.year, month: selectedPeriod.month },
      select: { companyCode: true, _count: { select: { balances: true, vouchers: true, cashFlowAllocations: true } } },
    }),
    prisma.financeStatementWorkpaper.findMany({
      where: { companyCode: { in: companyCodes }, year: selectedPeriod.year, month: selectedPeriod.month, reportType: { in: [...REPORT_TYPES] } },
      select: { id: true, version: true, companyCode: true, reportType: true, status: true, lines: { select: { manualAmount: true, importedAmount: true, formulaText: true, source: true } } },
    }),
  ]) : [[], []];
  const factsByCompany = new Map(periodFacts.map((period) => [period.companyCode, period._count]));
  const workpaperMap = new Map(workpapers.map((workpaper) => [`${workpaper.companyCode}:${workpaper.reportType}`, workpaper]));
  const entities: ConsolidationEntityCoverage[] = requestedBatch
    ? requestedBatch.entities.map((entity) => {
        const sourceMap = new Map(requestedBatch.sources.filter((source) => source.entitySnapshotId === entity.id).map((source) => [source.reportType, source]));
        const row = {
          entitySnapshotId: entity.id,
          companyId: entity.companyId,
          relationId: entity.relationId,
          code: entity.companyCode,
          name: entity.companyName,
          role: entity.role === "parent" ? "母公司" as const : "子公司" as const,
          parentCode: entity.directParentCode,
          parentName: null,
          shareRatio: entity.shareRatio === null ? null : Number(entity.shareRatio),
          balanceSheet: frozenSourceCoverage(sourceMap.get("balanceSheet")),
          incomeStatement: frozenSourceCoverage(sourceMap.get("incomeStatement")),
          cashFlow: frozenSourceCoverage(sourceMap.get("cashFlow")),
        };
        return { ...row, status: entityStatus(row) };
      })
    : liveScope.map((entity) => {
        const facts = factsByCompany.get(entity.companyCode);
        const row = {
          entitySnapshotId: null,
          companyId: entity.companyId,
          relationId: entity.relationId,
          code: entity.companyCode,
          name: entity.companyName,
          role: entity.role === "parent" ? "母公司" as const : "子公司" as const,
          parentCode: entity.directParentCode,
          parentName: null,
          shareRatio: entity.shareRatio,
          balanceSheet: liveSourceCoverage(workpaperMap.get(`${entity.companyCode}:balanceSheet`), facts?.balances ?? 0),
          incomeStatement: liveSourceCoverage(workpaperMap.get(`${entity.companyCode}:incomeStatement`), facts?.vouchers ?? 0),
          cashFlow: liveSourceCoverage(workpaperMap.get(`${entity.companyCode}:cashFlow`), facts?.cashFlowAllocations ?? 0),
        };
        return { ...row, status: entityStatus(row) };
      });
  const allSources = entities.flatMap((entity) => [entity.balanceSheet, entity.incomeStatement, entity.cashFlow]);
  const coveredSources = allSources.filter((source) => source.kind !== "missing").length;
  const submittedWorkpapers = allSources.filter((source) => source.status === "submitted").length;
  const missingSources = allSources.filter((source) => source.kind === "missing").length;
  const fallbackSources = allSources.filter((source) => (source.kind === "system" && !source.evidence) || source.status === "draft").length;
  const invalidOwnership = entities.filter((entity) => entity.role === "子公司" && (entity.shareRatio === null || entity.shareRatio <= 0 || entity.shareRatio > 1)).length;
  const selectedComparativePeriodEnd = comparativePeriodEndDate(selectedPeriodEnd);
  const liveExchangeRateRows = requestedBatch || scopeError ? [] : await prisma.financeStatementExchangeRate.findMany({
    where: { baseCurrency: "CAD", quoteCurrency: "CNY", rateDate: { lte: selectedPeriodEnd } },
    orderBy: [{ rateDate: "desc" }, { version: "desc" }],
    take: 100,
  });
  const rates: StatementExchangeRateSnapshot[] = requestedBatch
    ? requestedBatch.exchangeRates.map((rate) => ({
        id: rate.exchangeRateId,
        version: rate.exchangeRateVersion,
        baseCurrency: rate.baseCurrency,
        quoteCurrency: rate.quoteCurrency,
        rateKind: rate.rateKind as StatementExchangeRateSnapshot["rateKind"],
        rateDate: rate.rateDate,
        rate: Number(rate.rate),
        sourceName: "中国银行外汇牌价",
        sourceField: "中行折算价",
        sourceUrl: rate.sourceUrl,
        publishedAt: rate.publishedAt?.toISOString() ?? null,
        capturedAt: rate.createdAt.toISOString(),
        status: "verified",
        note: "合并批次冻结汇率证据",
        updatedBy: rate.verifiedBy,
        verifiedBy: rate.verifiedBy,
        verifiedAt: rate.verifiedAt?.toISOString() ?? null,
      }))
    : liveExchangeRateRows.map(statementExchangeRateSnapshot);
  const cadEntityIds = new Set(requestedBatch?.entities
    .filter((entity) => entity.functionalCurrency === "CAD")
    .map((entity) => entity.id) ?? []);
  const currencyPoliciesComplete = Boolean(requestedBatch?.entities.every((entity) =>
    (entity.functionalCurrency === "CNY" || entity.functionalCurrency === "CAD")
    && entity.currencyEvidence?.trim(),
  ));
  const frozenRateApplications = requestedBatch?.exchangeRates.flatMap((rate) =>
    parseConsolidationRateApplications(rate.applications).map((application) => ({ rate, application })),
  ) ?? [];
  const validClosingApplications = frozenRateApplications.filter(({ rate, application }) =>
    rate.rateKind === "closing"
    && application.applicationType === "closing"
    && application.periodBasis === "current"
    && cadEntityIds.has(application.entitySnapshotId)
    && application.targetDate === selectedPeriodEnd
    && isClosingRateNearPeriodEnd(rate.rateDate, selectedPeriodEnd),
  );
  const closingApplicationCounts = new Map<number, number>();
  for (const { application } of validClosingApplications) {
    closingApplicationCounts.set(
      application.entitySnapshotId,
      (closingApplicationCounts.get(application.entitySnapshotId) ?? 0) + 1,
    );
  }
  const comparativeCadEntityIds = new Set(comparativeEntitySnapshotIds(requestedBatch?.sources ?? [])
    .filter((entityId) => cadEntityIds.has(entityId)));
  const validComparativeClosingApplications = frozenRateApplications.filter(({ rate, application }) =>
    rate.rateKind === "closing"
    && application.applicationType === "closing"
    && application.periodBasis === "comparative"
    && comparativeCadEntityIds.has(application.entitySnapshotId)
    && application.targetDate === selectedComparativePeriodEnd
    && isClosingRateNearPeriodEnd(rate.rateDate, selectedComparativePeriodEnd),
  );
  const comparativeClosingApplicationCounts = new Map<number, number>();
  for (const { application } of validComparativeClosingApplications) {
    comparativeClosingApplicationCounts.set(
      application.entitySnapshotId,
      (comparativeClosingApplicationCounts.get(application.entitySnapshotId) ?? 0) + 1,
    );
  }
  const closingCoverageComplete = [...cadEntityIds].every((entityId) => closingApplicationCounts.get(entityId) === 1)
    && [...comparativeCadEntityIds].every((entityId) => comparativeClosingApplicationCounts.get(entityId) === 1);
  const frozenClosingRateId = validClosingApplications[0]?.rate.exchangeRateId;
  const closingRate = requestedBatch
    ? rates.find((rate) => rate.id === frozenClosingRateId) ?? null
    : rates.find((rate) => rate.rateKind === "closing" && rate.status === "verified" && isClosingRateNearPeriodEnd(rate.rateDate, selectedPeriodEnd)) ?? null;
  const frozenComparativeClosingRateId = validComparativeClosingApplications[0]?.rate.exchangeRateId;
  const comparativeClosingRate = requestedBatch
    ? rates.find((rate) => rate.id === frozenComparativeClosingRateId) ?? null
    : rates.find((rate) => rate.rateKind === "closing" && rate.status === "verified" && isClosingRateNearPeriodEnd(rate.rateDate, selectedComparativePeriodEnd)) ?? null;
  const historicalApplicationByVoucher = new Map(frozenRateApplications
    .filter(({ application }) => (
      application.applicationType === "historicalInvestment"
      && application.periodBasis === "current"
      && application.voucherItemId
    ))
    .map((binding) => [binding.application.voucherItemId!, binding]));
  const historicalRateCount = requestedBatch
    ? historicalApplicationByVoucher.size
    : new Set(rates.filter((rate) => rate.rateKind === "historicalInvestment" && rate.status === "verified").map((rate) => rate.rateDate)).size;
  const investmentRows = await prisma.financeVoucherItem.findMany({
    where: { voucher: { companyCode: { in: companyCodes }, date: { lte: selectedPeriodEnd } }, account: { code: { startsWith: "1511" } }, currencyCode: "CAD" },
    select: { id: true, debit: true, credit: true, description: true, currencyCode: true, originalDebit: true, originalCredit: true, account: { select: { code: true } }, voucher: { select: { voucherNo: true, date: true, description: true, companyCode: true } } },
    orderBy: [{ voucher: { date: "desc" } }, { id: "desc" }],
  });
  const investmentEvidence = investmentRows.map((item) => {
    const originalAmountValue = Math.max(Math.abs(Number(item.originalDebit ?? 0)), Math.abs(Number(item.originalCredit ?? 0)));
    const originalAmount = originalAmountValue > 0 ? originalAmountValue : null;
    const rateBinding = historicalApplicationByVoucher.get(item.id);
    const transactionRate = rateBinding ? Number(rateBinding.rate.rate) : null;
    return { id: item.id, companyCode: item.voucher.companyCode, voucherNo: item.voucher.voucherNo, voucherDate: item.voucher.date, description: item.description || item.voucher.description, accountCode: item.account.code, bookedAmountCny: Math.max(item.debit, item.credit), currencyCode: item.currencyCode, originalAmount, transactionRate, rateStatus: originalAmount === null ? "missingOriginalCurrency" as const : transactionRate === null ? "missingRate" as const : "recorded" as const };
  });
  const missingInvestmentRateCount = investmentEvidence.filter((item) => item.rateStatus !== "recorded").length;
  const foreignEntities = entities.filter((entity) => entity.entitySnapshotId && cadEntityIds.has(entity.entitySnapshotId));
  const canadaSourceStatementsReady = foreignEntities.every((entity) =>
    [entity.balanceSheet, entity.incomeStatement, entity.cashFlow].every((source) => source.kind !== "missing"),
  );
  const decisions = new Map(requestedBatch?.controlDecisions.map((decision) => [decision.controlKey, decision]) ?? []);
  const eliminationTypes = ["investmentEquity", "nonControllingInterest", "intercompanyBalance", "internalTrading", "internalLongTermAsset", "incomeDividend", "cashFlow"] as const;
  const approvedEntries = requestedBatch?.entries.filter((entry) => entry.status === "approved").length ?? 0;
  const inProgressEntries = requestedBatch?.entries.filter((entry) => entry.status === "draft" || entry.status === "submitted").length ?? 0;
  const missingEliminationPackages = eliminationTypes.filter((entryType) => {
    const hasEntry = requestedBatch?.entries.some((entry) => entry.entryType === entryType);
    return !hasEntry && decisions.get(`elimination:${entryType}`)?.decision !== "notApplicable";
  });
  const taxEffectCount = requestedBatch?.entries.reduce((sum, entry) => sum + entry.taxEffects.length, 0) ?? 0;
  const approvedTaxEffectCount = requestedBatch?.entries
    .filter((entry) => entry.status === "approved")
    .reduce((sum, entry) => sum + entry.taxEffects.length, 0) ?? 0;
  const partialOwnershipEntities = entities.filter((entity) => entity.role === "子公司" && entity.shareRatio !== null && entity.shareRatio < 1);
  const approvedNciLines = requestedBatch?.entries
    .filter((entry) => entry.status === "approved" && entry.entryType === "nonControllingInterest")
    .flatMap((entry) => entry.lines.filter((line) => (line.periodBasis ?? "current") === "current")) ?? [];
  const nciIncompleteEntityCodes = partialOwnershipEntities.filter((entity) => {
    const lineCodes = new Set(approvedNciLines
      .filter((line) => line.companyId === entity.companyId)
      .map((line) => line.lineCode));
    return !lineCodes.has("nonControllingInterests") || !lineCodes.has("netProfitAttributableToNci");
  }).map((entity) => entity.code);
  const partialOwnershipCount = partialOwnershipEntities.length;
  const nciAllocationReady = nciIncompleteEntityCodes.length === 0;
  const incompleteMatchingEntries = requestedBatch?.entries.filter((entry) => (
    ["intercompanyBalance", "internalTrading", "cashFlow"].includes(entry.entryType)
    && (entry.lines.some((line) => (
      !line.matchSide
      || !line.sourceKind
      || !line.sourceId
      || !line.sourceFingerprint
      || line.sourceAmount === null
      || !line.sourceCurrency
      || !line.counterpartyCompanyId
    )) || Number(entry.matchDifference ?? 0) > 0 && !entry.differenceResolution?.trim())
  )).length ?? 0;
  const incompleteTaxEffects = requestedBatch?.entries.flatMap((entry) => entry.taxEffects).filter((tax) => (
    !tax.entitySnapshotId
    || !tax.jurisdiction?.trim()
    || tax.recognition !== "unrecognized" && (!tax.recognitionLocation || !tax.balanceSheetLineCode || !tax.counterpartLineCode)
  )).length ?? 0;
  const checks: ConsolidationReadinessCheck[] = [
    { key: "scope", label: "合并范围", status: entities.length > 1 ? "ready" : "blocked", detail: scopeError ?? (entities.length > 1 ? `已识别 ${entities.length} 个合并实体` : "尚无完整合并范围"), facts: { parentCompanyId, entityCount: entities.length, batchId: requestedBatch?.id ?? null, scopeAsOf }, evidence: scopeError ? [scopeError] : entities.map((entity) => `${entity.code} ${entity.name}`), dependencyKeys: [], resolution: resolution(requestedBatch?.id ?? null, "scope") },
    { key: "ownership", label: "股权比例与少数股东口径", status: invalidOwnership > 0 || !nciAllocationReady ? "blocked" : entities.length > 1 ? "ready" : "blocked", detail: invalidOwnership > 0 ? `${invalidOwnership} 条直接持股比例缺失或超出0至1` : !nciAllocationReady ? `${nciIncompleteEntityCodes.join("、")} 尚未分别完成少数股东权益和损益分配` : partialOwnershipCount > 0 ? "持股比例有效，各非全资子公司的少数股东权益及损益分配均已批准" : "批次范围内直接持股比例有效且无少数股东", facts: { invalidOwnership, partialOwnershipCount, nciAllocationReady, nciIncompleteEntityCodes: nciIncompleteEntityCodes.join(","), subsidiaryCount: entities.filter((entity) => entity.role === "子公司").length }, evidence: entities.filter((entity) => entity.role === "子公司").map((entity) => `${entity.parentCode}→${entity.code} ${entity.shareRatio ?? "未填"}`), dependencyKeys: ["scope"], resolution: resolution(requestedBatch?.id ?? null, "ownership") },
    { key: "sources", label: "个别三表与来源链", status: missingSources > 0 ? "blocked" : fallbackSources > 0 ? "attention" : allSources.length > 0 ? "ready" : "blocked", detail: missingSources > 0 ? `${missingSources} 份个别报表缺少来源` : fallbackSources > 0 ? `${fallbackSources} 份来源仍需提交底稿或确认系统账快照` : `${allSources.length} 份个别报表来源已冻结`, facts: { total: allSources.length, missing: missingSources, pendingEvidence: fallbackSources, submittedWorkpapers }, evidence: allSources.filter((source) => source.fingerprint).map((source) => source.fingerprint!), dependencyKeys: ["scope"], resolution: resolution(requestedBatch?.id ?? null, "sources") },
    { key: "fx", label: "外币折算与汇率复核", status: !requestedBatch || !currencyPoliciesComplete ? "blocked" : cadEntityIds.size === 0 ? "ready" : !canadaSourceStatementsReady || !closingCoverageComplete || missingInvestmentRateCount > 0 ? "blocked" : "ready", detail: !requestedBatch ? "需先创建批次并确认每个实体的本位币" : !currencyPoliciesComplete ? "批次内仍有实体未确认本位币或判断依据" : cadEntityIds.size === 0 ? "批次内实体均已确认为 CNY 本位币" : !canadaSourceStatementsReady ? "CAD 本位币主体个别三表尚未冻结完整" : !closingCoverageComplete ? `CAD 本位币主体必须绑定本期期末汇率；${comparativeCadEntityIds.size} 个含非零上期数的主体还必须绑定比较期期末汇率` : missingInvestmentRateCount > 0 ? `${missingInvestmentRateCount} 笔 CAD 投资付款缺原币或冻结历史汇率` : "本期、适用比较期及投资日汇率证据已冻结", facts: { cadEntityCount: cadEntityIds.size, comparativeCadEntityCount: comparativeCadEntityIds.size, incompleteCurrencyPolicyCount: requestedBatch?.entities.filter((entity) => !entity.functionalCurrency || !entity.currencyEvidence?.trim()).length ?? 0, closingBindingCount: validClosingApplications.length, comparativeClosingBindingCount: validComparativeClosingApplications.length, closingRateId: closingRate?.id ?? null, comparativeClosingRateId: comparativeClosingRate?.id ?? null, historicalRateCount, missingInvestmentRateCount }, evidence: requestedBatch?.exchangeRates.map((rate) => `#${rate.exchangeRateId} v${rate.exchangeRateVersion} ${rate.rateKind} ${rate.rateDate}`) ?? [], dependencyKeys: ["sources"], resolution: resolution(requestedBatch?.id ?? null, "fx") },
    { key: "eliminations", label: "合并抵销", status: missingEliminationPackages.length > 0 || incompleteMatchingEntries > 0 ? "blocked" : inProgressEntries > 0 ? "attention" : "ready", detail: missingEliminationPackages.length > 0 ? `${missingEliminationPackages.length} 类抵销事项尚无分录或不适用结论` : incompleteMatchingEntries > 0 ? `${incompleteMatchingEntries} 笔内部往来/交易/资金抵销缺少双方结构化来源或差额处置` : inProgressEntries > 0 ? `${inProgressEntries} 笔抵销分录编制或复核中` : `${approvedEntries} 笔抵销分录已批准，其余类别已有不适用结论`, facts: { approvedEntries, inProgressEntries, incompleteMatchingEntries, unresolvedPackageCount: missingEliminationPackages.length }, evidence: requestedBatch?.entries.map((entry) => `${entry.entryNo} v${entry.version} ${entry.status}`) ?? [], dependencyKeys: ["ownership", "sources", "fx"], resolution: resolution(requestedBatch?.id ?? null, "eliminations") },
    { key: "tax", label: "抵销税务影响", status: incompleteTaxEffects > 0 ? "blocked" : approvedTaxEffectCount > 0 || decisions.get("tax")?.decision === "notApplicable" ? "ready" : taxEffectCount > 0 ? "attention" : "blocked", detail: incompleteTaxEffects > 0 ? `${incompleteTaxEffects} 项税务影响缺少纳税主体、税辖区或入表位置` : approvedTaxEffectCount > 0 ? `${approvedTaxEffectCount} 项税务影响已随分录批准并进入合并输出` : decisions.get("tax")?.decision === "notApplicable" ? "已记录无税务影响的人工结论" : taxEffectCount > 0 ? `${taxEffectCount} 项税务影响待复核` : "尚未处理抵销税务影响", facts: { taxEffectCount, approvedTaxEffectCount, incompleteTaxEffects }, evidence: requestedBatch?.controlDecisions.filter((decision) => decision.controlKey === "tax").map((decision) => decision.evidence) ?? [], dependencyKeys: ["eliminations"], resolution: resolution(requestedBatch?.id ?? null, "tax") },
    { key: "review", label: "编制、复核、锁定与发布", status: requestedBatch?.status === "locked" || requestedBatch?.status === "published" ? "ready" : requestedBatch ? "attention" : "blocked", detail: requestedBatch ? `批次 v${requestedBatch.version} 当前状态：${requestedBatch.status}` : "尚未创建合并批次", facts: { batchId: requestedBatch?.id ?? null, version: requestedBatch?.version ?? null, status: requestedBatch?.status ?? "none", reviewedBy: requestedBatch?.reviewedBy ?? null }, evidence: requestedBatch?.reviewNote ? [requestedBatch.reviewNote] : [], dependencyKeys: ["scope", "ownership", "sources", "fx", "eliminations", "tax"], resolution: resolution(requestedBatch?.id ?? null, "review", requestedBatch?.status) },
  ];
  const blockerCount = checks.filter((check) => check.status !== "ready").length;
  const published = requestedBatch?.status === "published";
  const locked = requestedBatch?.status === "locked" || published;
  const parentEntity = entities.find((entity) => entity.role === "母公司");
  const parent = parentEntity ? { id: parentEntity.companyId, code: parentEntity.code, name: parentEntity.name, fullName: parentEntity.name } : null;
  return {
    scope: { parent, parentCompanyId, batchId: requestedBatch?.id ?? null, year: selectedPeriod.year, month: selectedPeriod.month, periodLabel: `${selectedPeriod.year}年${selectedPeriod.month}月`, availablePeriods },
    batch: requestedBatch ? consolidationBatchSnapshot(requestedBatch) : null,
    metrics: { entityCount: entities.length, coveredSources, totalSources: entities.length * 3, submittedWorkpapers, blockerCount },
    entities,
    checks,
    eliminations: eliminationPackages(requestedBatch),
    fxPolicy: { pair: "CAD/CNY", sourceName: "中国银行外汇牌价", sourceField: "中行折算价", unit: "人民币/100外币", sourceUrl: "https://www.boc.cn/sourcedb/whpj/", status: currencyPoliciesComplete && (cadEntityIds.size === 0 || closingCoverageComplete && missingInvestmentRateCount === 0 && canadaSourceStatementsReady) ? "ready" : rates.length > 0 ? "partiallyConfigured" : "notConfigured", periodEndDate: selectedPeriodEnd, comparativePeriodEndDate: selectedComparativePeriodEnd, closingRate, comparativeClosingRate, historicalRateCount, rates, investmentEvidence, missingInvestmentRateCount, canadaSourceStatementsReady, note: "汇率保存与独立复核分离；批次按实体冻结本期期末汇率，仅为含非零上期数的 CAD 主体冻结比较期期末汇率，并按投资凭证和期间口径冻结历史汇率。" },
    outputs: [
      { key: "balanceSheet", label: "合并资产负债表", status: published ? "published" : "unpublished", description: published ? `来自已发布批次 v${requestedBatch?.version}` : "完成控制链并锁定批次后生成。" },
      { key: "incomeStatement", label: "合并利润表", status: published ? "published" : "unpublished", description: published ? `来自已发布批次 v${requestedBatch?.version}` : "完成抵销、少数股东损益和复核后生成。" },
      { key: "cashFlow", label: "合并现金流量表", status: published ? "published" : "unpublished", description: published ? `来自已发布批次 v${requestedBatch?.version}` : "完成内部现金流抵销和复核后生成。" },
    ],
    outputStatus: locked ? "ready" : "blocked",
    outputMessage: published ? `合并批次 v${requestedBatch?.version} 已发布，读取锁定时冻结的输出快照。` : locked ? `合并批次 v${requestedBatch?.version} 已锁定，正式候选输出已冻结。` : `当前有 ${blockerCount} 项控制点未闭环；系统不会输出未锁定的合并报表。`,
  };
}
