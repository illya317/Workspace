import type {
  ConsolidationBatchStatus,
  ConsolidationEliminationPackage,
  ConsolidationEntityCoverage,
  ConsolidationOverview,
  ConsolidationPeriodOption,
  ConsolidationReadinessCheck,
  StatementExchangeRateSnapshot,
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
import { loadConsolidationAdjustmentComparisons } from "./consolidation-adjustment-comparisons";
import {
  selectDefaultConsolidationParentId,
  selectLatestCompleteConsolidationPeriod,
} from "./consolidation-overview-selection";
import { loadConsolidationCompanyDirectory } from "./consolidation-company-directory";
import { loadConsolidationSourceReadiness } from "./consolidation-source-readiness";
import {
  consolidationEntitySourceStatus,
  frozenSourceCoverage,
  liveSourceCoverage,
} from "./consolidation-source-coverage";
import type { StatementPeriodKind } from "@workspace/finance/types/statement-period";

interface ConsolidationOverviewInput {
  year?: number;
  month?: number;
  periodKind?: StatementPeriodKind;
  parentCompanyId?: number;
  batchId?: number;
  includeComparisons?: boolean;
}

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

function resolution(
  batchId: number | null,
  key: string,
  batchStatus?: string,
): ConsolidationReadinessCheck["resolution"] {
  const batchTarget = batchId ? `/api/modules/finance/statements/consolidation/batches/${batchId}` : "/api/modules/finance/statements/consolidation/batches";
  if (key === "scope" || key === "ownership") return {
    ownerModule: "capitalSecurities" as const,
    actionKey: "capitalSecurities.governance.ownershipInterest.update",
    target: "/capital-securities/governance",
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
  return [
    item("investment-equity", "长期股权投资与子公司权益", "抵销母公司投资与子公司归属于合并前的权益。", "investmentEquity", "投资协议、出资凭证、子公司权益变动表", "投资成本、购买日净资产与合并商誉/差额勾稽", "investmentEquity"),
    item("intercompany-balances", "内部往来、借款与减值", "核对并抵销应收应付、借款及相关减值。", "balancesTransactions", "双方余额、对账单、账龄和减值明细", "债权债务、利息及减值准备成对相等", "intercompanyBalance"),
  ];
}

async function loadBatch(input: ConsolidationOverviewInput) {
  if (input.batchId) return prisma.financeConsolidationBatch.findUnique({
    where: { id: input.batchId },
    include: CONSOLIDATION_BATCH_INCLUDE,
  });
  if (!input.parentCompanyId || !input.year || !input.month) return null;
  return prisma.financeConsolidationBatch.findFirst({
    where: { parentCompanyId: input.parentCompanyId, year: input.year, month: input.month,
      periodKind: input.periodKind ?? "month" },
    include: CONSOLIDATION_BATCH_INCLUDE,
    orderBy: { version: "desc" },
  });
}

export async function loadConsolidationOverview(
  input: ConsolidationOverviewInput = {},
): Promise<ConsolidationOverview | ServiceResult<never>> {
  let requestedBatch = await loadBatch(input);
  if (input.batchId && !requestedBatch) return serviceError("合并批次不存在", 404);
  if (requestedBatch && (
    input.parentCompanyId && input.parentCompanyId !== requestedBatch.parentCompanyId
    || input.year && input.year !== requestedBatch.year
    || input.month && input.month !== requestedBatch.month
    || input.periodKind && input.periodKind !== requestedBatch.periodKind
  )) {
    return serviceError("batchId 与母公司或期间参数不一致", 409);
  }
  let parentCompanyId = requestedBatch?.parentCompanyId ?? input.parentCompanyId ?? null;
  if (!parentCompanyId) {
    const ownershipInterests = await prisma.ownershipInterest.findMany({
      where: { isConsolidated: true, owner: { company: { isNot: null } } },
      select: {
        issuerCompanyId: true,
        owner: { select: { company: { select: { id: true } } } },
      },
    });
    parentCompanyId = selectDefaultConsolidationParentId(ownershipInterests.flatMap((interest) => (
      interest.owner.company
        ? [{ parentId: interest.owner.company.id, childId: interest.issuerCompanyId }]
        : []
    )));
  }
  const now = new Date();
  let scopeAsOf = periodEndDate(
    input.year ?? requestedBatch?.year ?? now.getFullYear(),
    input.month ?? requestedBatch?.month ?? now.getMonth() + 1,
  );
  let scopeError: string | null = null;
  let liveScope = parentCompanyId && !requestedBatch
    ? await loadConsolidationScopeFacts(parentCompanyId, scopeAsOf).catch((cause: unknown) => {
        console.error("Failed to load consolidation scope facts", cause);
        scopeError = consolidationScopeErrorMessage(cause);
        return [];
      })
    : [];
  const discoveryCompanyCodes = requestedBatch
    ? requestedBatch.entities.map((entity) => entity.companyCode)
    : liveScope.map((entity) => entity.companyCode);
  let factPeriods = discoveryCompanyCodes.length > 0 ? await prisma.financePeriod.findMany({
    where: { companyCode: { in: discoveryCompanyCodes }, OR: [{ balances: { some: {} } }, { vouchers: { some: {} } }, { cashFlowAllocations: { some: {} } }] },
    select: { companyCode: true, year: true, month: true, _count: { select: { balances: true, vouchers: true, cashFlowAllocations: true } } },
  }) : [];
  const periodMap = new Map<string, ConsolidationPeriodOption>();
  for (const period of factPeriods) periodMap.set(periodKey(period.year, period.month), { year: period.year, month: period.month, label: `${period.year}年${period.month}月` });
  const availablePeriods = [...periodMap.values()].sort((left, right) => right.year - left.year || right.month - left.month);
  const latestCompletePeriod = selectLatestCompleteConsolidationPeriod({
    companyCodes: discoveryCompanyCodes,
    factPeriods,
    availablePeriods,
    today: now,
  });
  const selectedPeriod = requestedBatch
    ? { year: requestedBatch.year, month: requestedBatch.month }
    : input.year && input.month ? { year: input.year, month: input.month }
      : latestCompletePeriod
        ?? availablePeriods.find((period) => period.year < now.getFullYear() || period.year === now.getFullYear() && period.month <= now.getMonth() + 1)
        ?? availablePeriods[0] ?? { year: now.getFullYear(), month: 12 };
  const selectedPeriodKind = (requestedBatch?.periodKind as StatementPeriodKind | undefined) ?? input.periodKind ?? "month";
  if (!requestedBatch && parentCompanyId) {
    requestedBatch = await loadBatch({
      parentCompanyId,
      year: selectedPeriod.year,
      month: selectedPeriod.month,
      periodKind: selectedPeriodKind,
    });
  }
  const selectedScopeAsOf = periodEndDate(selectedPeriod.year, selectedPeriod.month);
  const shouldReloadLiveScope = !requestedBatch && parentCompanyId && selectedScopeAsOf !== scopeAsOf;
  scopeAsOf = selectedScopeAsOf;
  if (shouldReloadLiveScope && parentCompanyId) {
    liveScope = await loadConsolidationScopeFacts(parentCompanyId, scopeAsOf).catch((cause: unknown) => {
      console.error("Failed to load consolidation scope facts", cause);
      scopeError = consolidationScopeErrorMessage(cause);
      return [];
    });
  }
  const companyCodes = requestedBatch
    ? requestedBatch.entities.map((entity) => entity.companyCode)
    : liveScope.map((entity) => entity.companyCode);
  if (companyCodes.join("\u0000") !== discoveryCompanyCodes.join("\u0000")) {
    factPeriods = companyCodes.length > 0 ? await prisma.financePeriod.findMany({
      where: { companyCode: { in: companyCodes }, OR: [{ balances: { some: {} } }, { vouchers: { some: {} } }, { cashFlowAllocations: { some: {} } }] },
      select: { companyCode: true, year: true, month: true, _count: { select: { balances: true, vouchers: true, cashFlowAllocations: true } } },
    }) : [];
    periodMap.clear();
    for (const period of factPeriods) periodMap.set(periodKey(period.year, period.month), { year: period.year, month: period.month, label: `${period.year}年${period.month}月` });
    availablePeriods.splice(0, availablePeriods.length, ...[...periodMap.values()].sort((left, right) => right.year - left.year || right.month - left.month));
  }
  const companyDirectory = await loadConsolidationCompanyDirectory(companyCodes);
  const batchVersions = parentCompanyId ? (await prisma.financeConsolidationBatch.findMany({
    where: {
      parentCompanyId,
      year: selectedPeriod.year,
      month: selectedPeriod.month,
      periodKind: selectedPeriodKind,
    },
    select: {
      id: true,
      version: true,
      revision: true,
      status: true,
      baseBatchId: true,
    },
    orderBy: [{ version: "desc" }, { id: "desc" }],
  })).map((batch) => ({
    ...batch,
    status: batch.status as ConsolidationBatchStatus,
  })) : [];
  const selectedPeriodEnd = periodEndDate(selectedPeriod.year, selectedPeriod.month);
  const sourceReadiness = await loadConsolidationSourceReadiness({
    companyCodes,
    year: selectedPeriod.year,
    month: selectedPeriod.month,
    periodKind: selectedPeriodKind,
  });
  const entities: ConsolidationEntityCoverage[] = requestedBatch
    ? requestedBatch.entities.map((entity) => {
        const sourceMap = new Map(requestedBatch.sources.filter((source) => source.entitySnapshotId === entity.id).map((source) => [source.reportType, source]));
        const row = {
          entitySnapshotId: entity.id,
          companyId: entity.companyId,
          relationId: entity.relationId,
          code: entity.companyCode,
          name: companyDirectory.displayName(entity.companyId, entity.companyCode, entity.companyName),
          fullName: companyDirectory.find(entity.companyId, entity.companyCode)?.fullName ?? entity.companyName,
          role: entity.role === "parent" ? "母公司" as const : "子公司" as const,
          parentCode: entity.directParentCode,
          parentName: entity.directParentCode
            ? companyDirectory.displayName(entity.directParentCompanyId, entity.directParentCode, entity.directParentCode)
            : null,
          shareRatio: entity.shareRatio === null ? null : Number(entity.shareRatio),
          balanceSheet: frozenSourceCoverage(sourceMap.get("balanceSheet")),
          incomeStatement: frozenSourceCoverage(sourceMap.get("incomeStatement")),
          cashFlow: frozenSourceCoverage(sourceMap.get("cashFlow")),
        };
        return { ...row, status: consolidationEntitySourceStatus(row) };
      })
    : liveScope.map((entity) => {
        const readiness = sourceReadiness.byCompany.get(entity.companyCode);
        const row = {
          entitySnapshotId: null,
          companyId: entity.companyId,
          relationId: entity.relationId,
          code: entity.companyCode,
          name: companyDirectory.displayName(entity.companyId, entity.companyCode, entity.companyName),
          fullName: companyDirectory.find(entity.companyId, entity.companyCode)?.fullName ?? entity.companyName,
          role: entity.role === "parent" ? "母公司" as const : "子公司" as const,
          parentCode: entity.directParentCode,
          parentName: entity.directParentCode
            ? companyDirectory.displayName(entity.directParentCompanyId, entity.directParentCode, entity.directParentCode)
            : null,
          shareRatio: entity.shareRatio,
          balanceSheet: liveSourceCoverage(readiness?.reports.balanceSheet),
          incomeStatement: liveSourceCoverage(readiness?.reports.incomeStatement),
          cashFlow: liveSourceCoverage(readiness?.reports.cashFlow),
        };
        return { ...row, status: consolidationEntitySourceStatus(row) };
      });
  const allSources = entities.flatMap((entity) => [entity.balanceSheet, entity.incomeStatement, entity.cashFlow]);
  const coveredSources = allSources.filter((source) => source.kind !== "missing").length;
  const missingSources = allSources.filter((source) => source.kind === "missing").length;
  const invalidOwnership = entities.filter((entity) => entity.role === "子公司" && (entity.shareRatio === null || entity.shareRatio <= 0 || entity.shareRatio > 1)).length;
  const selectedComparativePeriodEnd = comparativePeriodEndDate(selectedPeriodEnd);
  const liveExchangeRateRows = scopeError ? [] : await prisma.financeStatementExchangeRate.findMany({
    where: { baseCurrency: "CAD", quoteCurrency: "CNY", rateDate: { lte: selectedPeriodEnd } },
    orderBy: [{ rateDate: "desc" }, { version: "desc" }],
    take: 100,
  });
  const frozenRates: StatementExchangeRateSnapshot[] = requestedBatch
    ? requestedBatch.exchangeRates.map((rate) => ({
        id: rate.exchangeRateId,
        version: rate.exchangeRateVersion,
        baseCurrency: rate.baseCurrency,
        quoteCurrency: rate.quoteCurrency,
        rateKind: rate.rateKind as StatementExchangeRateSnapshot["rateKind"],
        rateDate: rate.rateDate,
        rate: Number(rate.rate),
        sourceName: "中国外汇交易中心",
        sourceField: "人民币汇率中间价",
        sourceUrl: rate.sourceUrl,
        publishedAt: rate.publishedAt?.toISOString() ?? null,
        capturedAt: (rate.recordedAt ?? rate.createdAt).toISOString(),
        note: "合并批次冻结汇率证据",
        updatedBy: rate.recordedBy,
      }))
    : [];
  const frozenRateIds = new Set(frozenRates.map((rate) => rate.id));
  const rates: StatementExchangeRateSnapshot[] = [
    ...frozenRates,
    ...liveExchangeRateRows
      .filter((rate) => !frozenRateIds.has(rate.id))
      .map(statementExchangeRateSnapshot),
  ].sort((left, right) => right.rateDate.localeCompare(left.rateDate) || right.version - left.version);
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
    (rate.rateKind === "closing" || rate.rateKind === "centralParity")
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
    (rate.rateKind === "closing" || rate.rateKind === "centralParity")
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
    : rates.find((rate) => (rate.rateKind === "closing" || rate.rateKind === "centralParity") && isClosingRateNearPeriodEnd(rate.rateDate, selectedPeriodEnd)) ?? null;
  const frozenComparativeClosingRateId = validComparativeClosingApplications[0]?.rate.exchangeRateId;
  const comparativeClosingRate = requestedBatch
    ? rates.find((rate) => rate.id === frozenComparativeClosingRateId) ?? null
    : rates.find((rate) => (rate.rateKind === "closing" || rate.rateKind === "centralParity") && isClosingRateNearPeriodEnd(rate.rateDate, selectedComparativePeriodEnd)) ?? null;
  const currentHistoricalApplications = frozenRateApplications.filter(({ application }) => (
    (application.applicationType === "historicalInvestment" || application.applicationType === "historicalCapital")
    && application.periodBasis === "current"
  ));
  const historicalApplicationByVoucher = new Map(currentHistoricalApplications
    .filter(({ application }) => (
      application.applicationType === "historicalInvestment"
      && application.voucherItemId
    ))
    .map((binding) => [binding.application.voucherItemId!, binding]));
  const historicalRateCount = requestedBatch
    ? currentHistoricalApplications.length
    : new Set(rates.filter((rate) => rate.rateKind === "historicalInvestment" || rate.rateKind === "centralParity").map((rate) => rate.rateDate)).size;
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
  const eliminationTypes = ["investmentEquity", "intercompanyBalance"] as const;
  const approvedEntries = requestedBatch?.entries.filter((entry) => entry.status === "approved").length ?? 0;
  const inProgressEntries = requestedBatch?.entries.filter((entry) => entry.status === "draft" || entry.status === "submitted").length ?? 0;
  const missingEliminationPackages = eliminationTypes.filter((entryType) => {
    const hasEntry = requestedBatch?.entries.some((entry) => entry.entryType === entryType);
    return !hasEntry && decisions.get(`elimination:${entryType}`)?.decision !== "notApplicable";
  });
  const partialOwnershipEntities = entities.filter((entity) => entity.role === "子公司" && entity.shareRatio !== null && entity.shareRatio < 1);
  const partialOwnershipCount = partialOwnershipEntities.length;
  const incompleteMatchingEntries = requestedBatch?.entries.filter((entry) => (
    ["investmentEquity", "intercompanyBalance"].includes(entry.entryType)
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
  const checks: ConsolidationReadinessCheck[] = [
    { key: "scope", label: "合并范围", status: entities.length > 1 ? "ready" : "blocked", detail: scopeError ?? (entities.length > 1 ? `已识别 ${entities.length} 个合并实体` : "尚无完整合并范围"), facts: { parentCompanyId, entityCount: entities.length, batchId: requestedBatch?.id ?? null, scopeAsOf }, evidence: scopeError ? [scopeError] : entities.map((entity) => `${entity.code} ${entity.name}`), dependencyKeys: [], resolution: resolution(requestedBatch?.id ?? null, "scope") },
    { key: "ownership", label: "股权比例", status: invalidOwnership > 0 ? "blocked" : entities.length > 1 ? "ready" : "blocked", detail: invalidOwnership > 0 ? `${invalidOwnership} 条直接持股比例缺失或超出0至1` : partialOwnershipCount > 0 ? "持股比例有效；少数股东权益及损益分配本阶段暂不处理" : "批次范围内直接持股比例有效", facts: { invalidOwnership, partialOwnershipCount, subsidiaryCount: entities.filter((entity) => entity.role === "子公司").length }, evidence: entities.filter((entity) => entity.role === "子公司").map((entity) => `${entity.parentName ?? "待确认母公司"} → ${entity.name} ${entity.shareRatio ?? "未填"}`), dependencyKeys: ["scope"], resolution: resolution(requestedBatch?.id ?? null, "ownership") },
    { key: "sources", label: "个别三表", status: missingSources > 0 ? "blocked" : allSources.length > 0 ? "ready" : "blocked", detail: missingSources > 0 ? `${missingSources} 份未就绪；全部单体报表就绪后才能创建批次并开始对账抵销` : `${allSources.length} 份均已就绪并自动保存快照`, facts: { total: allSources.length, missing: missingSources }, evidence: allSources.filter((source) => source.fingerprint).map((source) => source.fingerprint!), dependencyKeys: ["scope"], resolution: resolution(requestedBatch?.id ?? null, "sources") },
    { key: "fx", label: "外币折算与汇率", status: !requestedBatch || !currencyPoliciesComplete ? "blocked" : cadEntityIds.size === 0 ? "ready" : !canadaSourceStatementsReady || !closingCoverageComplete ? "blocked" : "ready", detail: !requestedBatch ? "需先生成合并批次" : !currencyPoliciesComplete ? "币种主数据仍有实体缺少本位币，不能自动折算" : cadEntityIds.size === 0 ? "批次内实体均为 CNY 本位币" : !canadaSourceStatementsReady ? "CAD 本位币主体个别三表尚未冻结完整" : !closingCoverageComplete ? `尚未取得适用日期的中国货币网中间价；${comparativeCadEntityIds.size} 个含非零上期数的主体还需要比较期汇率` : "期末及必要发生日中间价已自动抓取并冻结；并购日处理本阶段暂不启用", facts: { cadEntityCount: cadEntityIds.size, comparativeCadEntityCount: comparativeCadEntityIds.size, incompleteCurrencyPolicyCount: requestedBatch?.entities.filter((entity) => !entity.functionalCurrency || !entity.currencyEvidence?.trim()).length ?? 0, closingBindingCount: validClosingApplications.length, comparativeClosingBindingCount: validComparativeClosingApplications.length, closingRateId: closingRate?.id ?? null, comparativeClosingRateId: comparativeClosingRate?.id ?? null, historicalRateCount, missingInvestmentRateCount }, evidence: requestedBatch?.exchangeRates.map((rate) => `#${rate.exchangeRateId} v${rate.exchangeRateVersion} ${rate.rateKind} ${rate.rateDate}`) ?? [], dependencyKeys: ["sources"], resolution: resolution(requestedBatch?.id ?? null, "fx") },
    { key: "eliminations", label: "合并抵销", status: missingEliminationPackages.length > 0 || incompleteMatchingEntries > 0 ? "blocked" : inProgressEntries > 0 ? "attention" : "ready", detail: missingEliminationPackages.length > 0 ? `${missingEliminationPackages.length} 类抵销事项尚无分录或不适用结论` : incompleteMatchingEntries > 0 ? `${incompleteMatchingEntries} 笔内部往来/交易/资金抵销缺少双方结构化来源或差额处置` : inProgressEntries > 0 ? `${inProgressEntries} 笔抵销分录编制或复核中` : `${approvedEntries} 笔抵销分录已批准，其余类别已有不适用结论`, facts: { approvedEntries, inProgressEntries, incompleteMatchingEntries, unresolvedPackageCount: missingEliminationPackages.length }, evidence: requestedBatch?.entries.map((entry) => `${entry.entryNo} v${entry.version} ${entry.status}`) ?? [], dependencyKeys: ["ownership", "sources", "fx"], resolution: resolution(requestedBatch?.id ?? null, "eliminations") },
    { key: "tax", label: "抵销税务影响", status: "ready", detail: "递延所得税本阶段暂不处理，不作为生成和发布阻断项", facts: { deferred: true }, evidence: [], dependencyKeys: ["eliminations"], resolution: resolution(requestedBatch?.id ?? null, "tax") },
    { key: "review", label: "编制、复核、锁定与发布", status: requestedBatch?.status === "locked" || requestedBatch?.status === "published" ? "ready" : requestedBatch ? "attention" : "blocked", detail: requestedBatch ? `批次 v${requestedBatch.version} 当前状态：${requestedBatch.status}` : "尚未创建合并批次", facts: { batchId: requestedBatch?.id ?? null, version: requestedBatch?.version ?? null, status: requestedBatch?.status ?? "none", reviewedBy: requestedBatch?.reviewedBy ?? null }, evidence: requestedBatch?.reviewNote ? [requestedBatch.reviewNote] : [], dependencyKeys: ["scope", "ownership", "sources", "fx", "eliminations"], resolution: resolution(requestedBatch?.id ?? null, "review", requestedBatch?.status) },
  ];
  const blockerCount = checks.filter((check) => check.status !== "ready").length;
  const published = requestedBatch?.status === "published";
  const locked = requestedBatch?.status === "locked" || published;
  const parentEntity = entities.find((entity) => entity.role === "母公司");
  const parentCompany = companyDirectory.find(parentEntity?.companyId, parentEntity?.code ?? "");
  const parent = parentEntity ? {
    id: parentEntity.companyId,
    code: parentEntity.code,
    name: parentCompany?.name ?? parentEntity.name,
    fullName: parentCompany?.fullName ?? parentEntity.name,
  } : null;
  const adjustmentComparisons = input.includeComparisons
    ? await loadConsolidationAdjustmentComparisons({ batch: requestedBatch, entities: entities.flatMap((entity) => entity.companyId ? [{ companyId: entity.companyId, code: entity.code, name: entity.name, role: entity.role === "母公司" ? "parent" as const : "subsidiary" as const }] : []) })
    : [];
  const batchSnapshot = requestedBatch ? consolidationBatchSnapshot(requestedBatch) : null;
  const displayBatch = batchSnapshot ? {
    ...batchSnapshot,
    parentCompanyName: parent?.name ?? batchSnapshot.parentCompanyName,
    entities: batchSnapshot.entities.map((entity) => ({
      ...entity,
      companyName: companyDirectory.displayName(entity.companyId, entity.companyCode, entity.companyName),
    })),
  } : null;
  const creationBlockedReasons = [
    ...(scopeError ? [scopeError] : []),
    ...(entities.length > 1 ? [] : ["合并范围尚未完整建立"]),
    ...(invalidOwnership > 0 ? [`${invalidOwnership} 条直接持股比例无效`] : []),
    ...(missingSources > 0 ? [`${missingSources} 份单体报表未就绪`] : []),
  ];
  return {
    scope: {
      parent,
      parentCompanyId,
      batchId: requestedBatch?.id ?? null,
      year: selectedPeriod.year,
      month: selectedPeriod.month,
      periodKind: selectedPeriodKind,
      periodLabel: selectedPeriodKind === "year"
        ? `${selectedPeriod.year}年度`
        : selectedPeriodKind === "quarter"
          ? `${selectedPeriod.year}年第${Math.ceil(selectedPeriod.month / 3)}季度`
          : `${selectedPeriod.year}年${selectedPeriod.month}月`,
      availablePeriods,
    },
    batch: displayBatch,
    batchVersions,
    batchCreation: {
      allowed: creationBlockedReasons.length === 0,
      unavailableReasons: creationBlockedReasons,
    },
    metrics: { entityCount: entities.length, coveredSources, totalSources: entities.length * 3, blockerCount },
    entities,
    adjustmentComparisons,
    checks,
    eliminations: eliminationPackages(requestedBatch),
    fxPolicy: { pair: "CAD/CNY", sourceName: "中国外汇交易中心", sourceField: "人民币汇率中间价", unit: "人民币/1外币", sourceUrl: "https://www.chinamoney.com.cn/chinese/bkccpr/", status: currencyPoliciesComplete && (cadEntityIds.size === 0 || closingCoverageComplete && canadaSourceStatementsReady) ? "ready" : rates.length > 0 ? "partiallyConfigured" : "notConfigured", periodEndDate: selectedPeriodEnd, comparativePeriodEndDate: selectedComparativePeriodEnd, closingRate, comparativeClosingRate, historicalRateCount, rates, investmentEvidence, missingInvestmentRateCount, canadaSourceStatementsReady, note: "系统自动抓取并冻结本期/比较期期末以及实收资本、股本、资本公积发生日的中国货币网人民币汇率中间价；并购日处理本阶段暂不启用。" },
    outputs: [
      { key: "balanceSheet", label: "合并资产负债表", status: published ? "published" : "unpublished", description: published ? `来自已发布批次 v${requestedBatch?.version}` : "完成控制链并锁定批次后生成。" },
      { key: "incomeStatement", label: "合并利润表", status: published ? "published" : "unpublished", description: published ? `来自已发布批次 v${requestedBatch?.version}` : "完成抵销、少数股东损益和复核后生成。" },
      { key: "cashFlow", label: "合并现金流量表", status: published ? "published" : "unpublished", description: published ? `来自已发布批次 v${requestedBatch?.version}` : "完成内部现金流抵销和复核后生成。" },
    ],
    outputStatus: locked ? "ready" : "blocked",
    outputMessage: published ? `合并批次 v${requestedBatch?.version} 已发布，读取锁定时冻结的输出快照。` : locked ? `合并批次 v${requestedBatch?.version} 已锁定，正式候选输出已冻结。` : `当前有 ${blockerCount} 项控制点未闭环；系统不会输出未锁定的合并报表。`,
  };
}
