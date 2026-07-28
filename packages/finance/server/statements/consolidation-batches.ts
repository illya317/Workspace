import {
  buildEnsureConsolidationBatchCommand,
  type EnsureConsolidationBatchCommand,
} from "../domain/consolidation-batch-validation";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { resolveUserBusinessActorName } from "@workspace/platform/server/user-identity";
import {
  CONSOLIDATION_BATCH_INCLUDE,
  consolidationBatchSnapshot,
  loadConsolidationBatchRow,
} from "./consolidation-dto";
import {
  ConsolidationSnapshotError,
  type ConsolidationRateFact,
  loadInitialSourceFacts,
  loadAvailableRateFacts,
  periodEndDate,
} from "./consolidation-snapshots";
import {
  consolidationRateFingerprint,
  consolidationScopeFingerprint,
  consolidationSourceBatchFingerprint,
} from "./consolidation-fingerprints";
import {
  appendConsolidationBatchEvent,
} from "./consolidation-mutations";
import {
  sourceHasNonzeroPreviousAmount,
} from "./consolidation-comparative";
import { ChinaMoneyRateError } from "./chinamoney-exchange-rates";
import {
  ensureChinaMoneyCentralParityRate,
  ensureChinaMoneyMonthlyAverageRate,
} from "./exchange-rates";
import {
  buildHistoricalCapitalRateApplications,
  buildRetainedEarningsRateApplications,
  loadCadInvestmentVoucherFacts,
  loadHistoricalCapitalFacts,
  retainedEarningsFactsFromFrozenSources,
} from "./consolidation-rate-applications";
import { consolidationSourcesReady } from "./consolidation-source-coverage";
import { loadFinanceConsolidationScope } from "./consolidation-scope-selections";
import {
  consolidationMonthEndDate,
  consolidationPeriodRateRequirements,
} from "./consolidation-period-rates";
import { cloneConsolidationEntryData } from "./consolidation-batch-cloning";

function snapshotError(cause: unknown) {
  if (cause instanceof ConsolidationSnapshotError) return serviceError(cause.message, cause.status);
  if (cause instanceof ChinaMoneyRateError) {
    return serviceError(cause.message, cause.status, { retryable: true });
  }
  if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
    const target = JSON.stringify(cause.meta?.target ?? "");
    if (target.includes("predecessorEntryId")
      || target.includes("supersedesEntryId")
      || target.includes("reversalOfEntryId")) {
      return serviceError("基础批次抵销分录已经存在后续版本，不能再次分支", 409);
    }
    return serviceError("同一期间的合并批次版本已存在，请刷新后重试", 409);
  }
  throw cause;
}

async function ensureRequiredCadRates(input: {
  targetDates: string[];
  userId: number;
}) {
  const rateIdByTargetDate = new Map<string, number>();
  for (const targetDate of [...new Set(input.targetDates)].sort()) {
    const row = await ensureChinaMoneyCentralParityRate({
      currencyCode: "CAD",
      targetDate,
      userId: input.userId,
    });
    rateIdByTargetDate.set(targetDate, row.id);
  }
  return rateIdByTargetDate;
}

async function ensureRequiredCadMonthlyAverageRates(input: {
  targetDates: string[];
  userId: number;
}) {
  const rateIdByTargetDate = new Map<string, number>();
  for (const targetDate of [...new Set(input.targetDates)].sort()) {
    const row = await ensureChinaMoneyMonthlyAverageRate({
      currencyCode: "CAD",
      targetDate,
      userId: input.userId,
    });
    rateIdByTargetDate.set(targetDate, row.id);
  }
  return rateIdByTargetDate;
}

async function loadBaseBatch(command: EnsureConsolidationBatchCommand) {
  const { input } = command;
  const latest = await prisma.financeConsolidationBatch.findFirst({
    where: {
      parentCompanyId: input.parentCompanyId,
      year: input.year,
      month: input.month,
      periodKind: input.periodKind,
    },
    include: CONSOLIDATION_BATCH_INCLUDE,
    orderBy: { version: "desc" },
  });
  if (!input.baseBatchId) {
    if (latest?.status === "draft") return { existing: latest, base: null, latest };
    if (latest && (latest.status === "submitted" || latest.status === "reviewed")) {
      throw new ConsolidationSnapshotError("当前期间已有待复核批次，不能并行创建新版本", 409);
    }
    return {
      existing: null,
      base: latest?.status === "locked" || latest?.status === "published" ? latest : null,
      latest,
    };
  }
  const base = await loadConsolidationBatchRow(input.baseBatchId);
  if (!base) throw new ConsolidationSnapshotError("基础合并批次不存在", 404);
  if (base.parentCompanyId !== input.parentCompanyId
    || base.year !== input.year
    || base.month !== input.month
    || base.periodKind !== input.periodKind) {
    throw new ConsolidationSnapshotError("基础批次不属于当前母公司和期间", 409);
  }
  if (base.status !== "locked" && base.status !== "published") {
    throw new ConsolidationSnapshotError("只有已锁定或已发布批次可以作为新版本基础", 409);
  }
  const existing = await prisma.financeConsolidationBatch.findFirst({
    where: { baseBatchId: base.id, status: "draft" },
    include: CONSOLIDATION_BATCH_INCLUDE,
  });
  if (existing) return { existing, base, latest };
  if (latest && latest.id !== base.id) {
    throw new ConsolidationSnapshotError("只能基于当前期间最新的已锁定或已发布批次创建新版本", 409);
  }
  return { existing, base, latest };
}

export async function ensureConsolidationBatch(rawCommand: EnsureConsolidationBatchCommand) {
  const validation = buildEnsureConsolidationBatchCommand(rawCommand.input, rawCommand.userId);
  if (!validation.ok) return serviceError(validation.issue.message, validation.issue.status);
  const command = validation.data;
  try {
    const { existing, base, latest } = await loadBaseBatch(command);
    if (existing) return serviceOk({ batch: consolidationBatchSnapshot(existing), created: false });
    const selectedPeriodEnd = periodEndDate(command.input.year, command.input.month);
    const { scope } = await loadFinanceConsolidationScope({
      parentCompanyId: command.input.parentCompanyId,
      year: command.input.year,
      month: command.input.month,
      periodKind: command.input.periodKind,
    }, selectedPeriodEnd);
    if (scope.length === 1) throw new ConsolidationSnapshotError("本次报表至少需要纳入一个子公司", 409);
    const scopeFingerprint = consolidationScopeFingerprint(scope);
    const sources = await loadInitialSourceFacts(
      scope,
      command.input.year,
      command.input.month,
      command.input.periodKind,
    );
    if (!consolidationSourcesReady(scope.length, sources)) {
      const missingCount = sources.filter((source) => source.sourceKind === "missing").length;
      throw new ConsolidationSnapshotError(`还有 ${missingCount} 份单体报表未就绪，不能创建合并批次`, 409);
    }
    const sourceFingerprint = consolidationSourceBatchFingerprint(sources);
    const direct = await assertBusinessActionDirectExecutionAllowed({
      businessActionKey: "finance.statements.consolidationBatch.ensure",
      actorUserId: command.userId,
      resourceKey: "finance.statements",
      scopeType: "global",
      scopeId: null,
      blockedMessage: "合并批次创建已配置为必须走流程，请从统一保存入口提交",
    });
    if (!direct.ok) return direct;
    const actorName = await resolveUserBusinessActorName(command.userId);
    if (!actorName) return serviceError("当前账号缺少员工身份且不是管理员，不能创建合并批次", 409);
    const cadCompanyCodes = scope.filter((entity) => entity.functionalCurrency === "CAD").map((entity) => entity.companyCode);
    const [historicalCapitalFacts, investmentFacts] = await Promise.all([
      loadHistoricalCapitalFacts(cadCompanyCodes, selectedPeriodEnd),
      loadCadInvestmentVoucherFacts(scope.map((entity) => entity.companyCode), selectedPeriodEnd),
    ]);
    const retainedEarningsFacts = retainedEarningsFactsFromFrozenSources({
      sources,
      companies: scope.map((entity) => ({
        companyId: entity.companyId,
        companyCode: entity.companyCode,
        functionalCurrency: entity.functionalCurrency,
      })),
    });
    const comparativeCompanyIds = new Set(sources.filter(sourceHasNonzeroPreviousAmount).map((source) => source.companyId));
    const cadEntities = scope.filter((entity) => entity.functionalCurrency === "CAD");
    const mappedInvestments = investmentFacts.flatMap((investment) => {
      const investor = scope.find((entity) => entity.companyCode === investment.companyCode);
      const directCandidates = investor
        ? cadEntities.filter((entity) => entity.directParentCompanyId === investor.companyId)
        : [];
      return directCandidates.length === 1 ? [{ investment, entity: directCandidates[0]! }] : [];
    });
    const rateRequirements = consolidationPeriodRateRequirements(command.input.year, command.input.month);
    const comparativeEquityPeriodEnd = consolidationMonthEndDate(command.input.year - 1, 12);
    let rateIdByTargetDate = new Map<string, number>();
    let averageRateIdByTargetDate = new Map<string, number>();
    let rates: ConsolidationRateFact[] = [];
    try {
      rateIdByTargetDate = cadCompanyCodes.length > 0
        ? await ensureRequiredCadRates({
          targetDates: [
            ...rateRequirements.closing.current,
            ...(comparativeCompanyIds.size > 0 ? rateRequirements.closing.comparative : []),
            ...historicalCapitalFacts.map((fact) => fact.targetDate),
            ...mappedInvestments.map(({ investment }) => investment.voucherDate),
          ],
          userId: command.userId,
        })
        : new Map<string, number>();
      averageRateIdByTargetDate = cadCompanyCodes.length > 0
        ? await ensureRequiredCadMonthlyAverageRates({
          targetDates: [
            ...rateRequirements.monthlyAverage.current,
            ...(comparativeCompanyIds.size > 0 ? rateRequirements.monthlyAverage.comparative : []),
            ...retainedEarningsFacts.map((fact) => fact.targetDate),
          ],
          userId: command.userId,
        })
        : new Map<string, number>();
      rates = cadCompanyCodes.length > 0
        ? await loadAvailableRateFacts(selectedPeriodEnd, [
          ...new Set([...rateIdByTargetDate.values(), ...averageRateIdByTargetDate.values()]),
        ])
        : [];
    } catch (cause) {
      if (!(cause instanceof ChinaMoneyRateError) && !(cause instanceof ConsolidationSnapshotError)) throw cause;
      console.warn("Automatic consolidation rate preparation is not ready during batch creation", cause.message);
      rateIdByTargetDate = new Map();
      averageRateIdByTargetDate = new Map();
      rates = [];
    }
    const version = (latest?.version ?? 0) + 1;
    const rateFingerprint = consolidationRateFingerprint(rates);
    const parent = scope[0]!;
    const row = await prisma.$transaction(async (tx) => {
      const currentLatest = await tx.financeConsolidationBatch.findFirst({
        where: {
          parentCompanyId: command.input.parentCompanyId,
          year: command.input.year,
          month: command.input.month,
          periodKind: command.input.periodKind,
        },
        select: { id: true, version: true, status: true },
        orderBy: { version: "desc" },
      });
      if ((currentLatest?.id ?? null) !== (latest?.id ?? null)
        || (currentLatest?.version ?? 0) !== (latest?.version ?? 0)
        || (currentLatest?.status ?? null) !== (latest?.status ?? null)) {
        throw new ConsolidationSnapshotError("合并批次版本在创建期间发生变化，请刷新后重试", 409);
      }
      if (base) {
        const currentBase = await tx.financeConsolidationBatch.findUnique({
          where: { id: base.id },
          select: { status: true },
        });
        if (!currentBase || (currentBase.status !== "locked" && currentBase.status !== "published")) {
          throw new ConsolidationSnapshotError("基础批次在创建期间发生变化，请刷新后重试", 409);
        }
      }
      const batch = await tx.financeConsolidationBatch.create({
        data: {
          parentCompanyId: parent.companyId,
          parentCompanyCode: parent.companyCode,
          parentCompanyName: parent.companyName,
          year: command.input.year,
          month: command.input.month,
          periodKind: command.input.periodKind,
          version,
          status: "draft",
          baseBatchId: base?.id ?? null,
          scopeFingerprint,
          sourceFingerprint,
          rateFingerprint,
          createdBy: command.userId,
        },
      });
      await appendConsolidationBatchEvent(tx, {
        batchId: batch.id,
        eventType: "lifecycle",
        action: "create",
        fromStatus: "none",
        toStatus: "draft",
        note: base
          ? `基于合并批次 ${base.id} 创建版本`
          : null,
        actorUserId: command.userId,
        actorName,
        batchRevision: 1,
      });
      const snapshotIdByCompany = new Map<number, number>();
      const sourceSnapshotIdByCompanyAndReportType = new Map<string, number>();
      const oldEntityCompanyById = new Map(base?.entities.map((entity) => [entity.id, entity.companyId]) ?? []);
      for (const entity of scope) {
        const snapshot = await tx.financeConsolidationEntitySnapshot.create({
          data: {
            batchId: batch.id,
            companyId: entity.companyId,
            companyCode: entity.companyCode,
            companyName: entity.companyName,
            role: entity.role,
            directParentCompanyId: entity.directParentCompanyId,
            directParentCode: entity.directParentCode,
            relationId: entity.relationId,
            relationUpdatedAt: entity.relationUpdatedAt,
            relationEffectiveFrom: entity.relationEffectiveFrom,
            relationEffectiveTo: entity.relationEffectiveTo,
            relationVersion: entity.relationVersion,
            shareRatio: entity.shareRatio,
            isConsolidated: entity.isConsolidated,
            functionalCurrency: entity.functionalCurrency,
            currencyEvidence: entity.currencyEvidence,
            currencyDecidedBy: entity.currencyDecidedBy,
          },
        });
        snapshotIdByCompany.set(entity.companyId, snapshot.id);
      }
      for (const source of sources) {
        const snapshot = await tx.financeConsolidationSourceSnapshot.create({
          data: {
            batchId: batch.id,
            entitySnapshotId: snapshotIdByCompany.get(source.companyId)!,
            reportType: source.reportType,
            sourceKind: source.sourceKind,
            sourceStatus: source.sourceStatus,
            workpaperId: source.workpaperId,
            workpaperVersion: source.workpaperVersion,
            sourceChecksum: source.sourceChecksum,
            workpaperUpdatedBy: source.workpaperUpdatedBy,
            sourcePackageId: source.sourcePackageId,
            sourcePackageRevision: source.sourcePackageRevision,
            sourcePackageStatus: source.sourcePackageStatus,
            sourcePackageChecksum: source.sourcePackageChecksum,
            sourcePackageUploadedBy: source.sourcePackageUploadedBy,
            sourcePackageSubmittedBy: source.sourcePackageSubmittedBy,
            lineCount: source.lineCount,
            sourcedLineCount: source.sourcedLineCount,
            importedLineCount: source.importedLineCount,
            manualLineCount: source.manualLineCount,
            formulaLineCount: source.formulaLineCount,
            reportPayload: source.reportPayload,
            fingerprint: source.fingerprint,
            evidence: source.evidence,
            selectedBy: command.userId,
          },
        });
        sourceSnapshotIdByCompanyAndReportType.set(`${source.companyId}:${source.reportType}`, snapshot.id);
      }
      await tx.financeConsolidationScopeSelection.deleteMany({
        where: {
          parentCompanyId: command.input.parentCompanyId,
          year: command.input.year,
          month: command.input.month,
          periodKind: command.input.periodKind,
        },
      });
      const companyIdByCode = new Map(scope.map((entity) => [entity.companyCode, entity.companyId]));
      const historicalApplications = buildHistoricalCapitalRateApplications({
        facts: historicalCapitalFacts,
        rateIdByTargetDate,
        comparativePeriodEnd: comparativeEquityPeriodEnd,
        comparativeCompanyIds,
        companyIdByCode,
        snapshotIdByCompany,
      });
      const retainedEarningsApplications = buildRetainedEarningsRateApplications({
        facts: retainedEarningsFacts,
        monthlyAverageRateIdByTargetDate: averageRateIdByTargetDate,
        currentPeriodEnd: selectedPeriodEnd,
        comparativeEquityPeriodEnd,
        comparativeCompanyIds,
        companyIdByCode,
        snapshotIdByCompany,
      });
      const investmentApplications = mappedInvestments.flatMap(({ investment, entity }) => {
        const exchangeRateId = rateIdByTargetDate.get(investment.voucherDate);
        const entitySnapshotId = snapshotIdByCompany.get(entity.companyId);
        if (!exchangeRateId || !entitySnapshotId) return [];
        const shared = {
          exchangeRateId,
          applicationType: "historicalInvestment" as const,
          entitySnapshotId,
          voucherItemId: investment.id,
          targetDate: investment.voucherDate,
          evidence: `投资凭证 ${investment.voucherNo} 按 ${investment.voucherDate} 中国货币网人民币汇率中间价自动折算`,
          capitalOriginalAmount: null,
          equityLineCode: null,
          voucher: {
            companyCode: investment.companyCode,
            voucherNo: investment.voucherNo,
            voucherDate: investment.voucherDate,
            description: investment.description,
            accountCode: investment.accountCode,
            bookedAmountCny: investment.bookedAmountCny,
            currencyCode: investment.currencyCode,
            originalAmount: investment.originalAmount,
          },
        };
        return [
          { ...shared, periodBasis: "current" as const },
          ...(investment.voucherDate <= comparativeEquityPeriodEnd && comparativeCompanyIds.has(entity.companyId)
            ? [{ ...shared, periodBasis: "comparative" as const }]
            : []),
        ];
      });
      const appliedRates = rates.map((rate) => {
        const closingApplications = scope.flatMap((entity) => {
          if (entity.functionalCurrency !== "CAD") return [];
          const entitySnapshotId = snapshotIdByCompany.get(entity.companyId)!;
          const shared = {
            applicationType: "closing",
            entitySnapshotId,
            voucherItemId: null,
            evidence: `中国外汇交易中心 ${rate.rateDate} 人民币汇率中间价`,
            capitalOriginalAmount: null,
            voucher: null,
          };
          return (["current", "comparative"] as const).flatMap((periodBasis) => (
            periodBasis === "current" || comparativeCompanyIds.has(entity.companyId)
              ? rateRequirements.closing[periodBasis].flatMap((targetDate) => (
                  rateIdByTargetDate.get(targetDate) === rate.exchangeRateId
                    ? [{ ...shared, periodBasis, targetDate }]
                    : []
                ))
              : []
          ));
        });
        const monthlyAverageApplications = scope.flatMap((entity) => {
          if (entity.functionalCurrency !== "CAD") return [];
          const entitySnapshotId = snapshotIdByCompany.get(entity.companyId)!;
          return (["current", "comparative"] as const).flatMap((periodBasis) => (
            periodBasis === "current" || comparativeCompanyIds.has(entity.companyId)
              ? rateRequirements.monthlyAverage[periodBasis].flatMap((targetDate) => (
                  averageRateIdByTargetDate.get(targetDate) === rate.exchangeRateId
                    ? [{
                        applicationType: "monthlyAverage",
                        periodBasis,
                        entitySnapshotId,
                        voucherItemId: null,
                        targetDate,
                        evidence: `${targetDate.slice(0, 7)} 中国外汇交易中心人民币汇率中间价月平均`,
                        capitalOriginalAmount: null,
                        voucher: null,
                      }]
                    : []
                ))
              : []
          ));
        });
        const applications = [
          ...closingApplications,
          ...monthlyAverageApplications,
          ...historicalApplications
            .filter((application) => application.exchangeRateId === rate.exchangeRateId)
            .map((application) => ({
              applicationType: application.applicationType,
              periodBasis: application.periodBasis,
              entitySnapshotId: application.entitySnapshotId,
              voucherItemId: application.voucherItemId,
              targetDate: application.capitalContributionDate,
              evidence: `中国外汇交易中心 ${rate.rateDate} 人民币汇率中间价；${application.evidence}`,
              capitalOriginalAmount: application.capitalOriginalAmount,
              equityLineCode: application.equityLineCode,
              voucher: null,
            })),
          ...retainedEarningsApplications
            .filter((application) => application.exchangeRateId === rate.exchangeRateId)
            .map((application) => ({
              applicationType: application.applicationType,
              periodBasis: application.periodBasis,
              entitySnapshotId: application.entitySnapshotId,
              voucherItemId: null,
              targetDate: application.targetDate,
              evidence: application.evidence,
              capitalOriginalAmount: application.capitalOriginalAmount,
              equityLineCode: application.equityLineCode,
              voucher: null,
            })),
          ...investmentApplications.filter((application) => application.exchangeRateId === rate.exchangeRateId),
        ];
        return { ...rate, applications: JSON.parse(JSON.stringify(applications)) as Prisma.InputJsonValue };
      });
      if (appliedRates.length > 0) {
        await tx.financeConsolidationRateSnapshot.createMany({
          data: appliedRates.map((rate) => ({
            batchId: batch.id,
            ...rate,
          })),
        });
      }
      await tx.financeConsolidationBatch.update({
        where: { id: batch.id },
        data: { rateFingerprint: consolidationRateFingerprint(appliedRates) },
      });
      for (const entry of base?.entries.filter((item) => item.status === "approved") ?? []) {
        await tx.financeConsolidationEntry.create({
          data: {
            batchId: batch.id,
            ...cloneConsolidationEntryData(
              entry,
              command.userId,
              snapshotIdByCompany,
              oldEntityCompanyById,
              sourceSnapshotIdByCompanyAndReportType,
            ),
          },
        });
      }
      return tx.financeConsolidationBatch.findUniqueOrThrow({
        where: { id: batch.id },
        include: CONSOLIDATION_BATCH_INCLUDE,
      });
    });
    return serviceOk({ batch: consolidationBatchSnapshot(row), created: true });
  } catch (cause) {
    return snapshotError(cause);
  }
}
