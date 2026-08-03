import type { ConsolidationControlKey } from "@workspace/finance/types";
import {
  buildSaveConsolidationSourcesCommand,
  type SaveConsolidationSourcesCommand,
} from "../domain/consolidation-batch-validation";
import { serviceError, serviceOk } from "@workspace/platform/service-result";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import {
  CONSOLIDATION_BATCH_INCLUDE,
  consolidationBatchSnapshot,
  loadConsolidationBatchRow,
} from "./consolidation-dto";
import {
  consolidationRateFingerprint,
  consolidationSourceBatchFingerprint,
  consolidationSourceContentBatchFingerprint,
} from "./consolidation-fingerprints";
import { hasMonthlyAverageRateEvidence } from "./consolidation-frozen-rates";
import {
  comparativeEntitySnapshotIds,
  comparativePeriodEndDate,
} from "./consolidation-comparative";
import { claimConsolidationBatchRevision } from "./consolidation-mutations";
import {
  applyConsolidationRatePolicies,
  buildHistoricalCapitalRateApplications,
  loadCadInvestmentVoucherFacts,
  loadHistoricalCapitalFacts,
  parseConsolidationRateApplications,
  type ConsolidationCurrencyPolicyFact,
  type ConsolidationRateApplicationFact,
} from "./consolidation-rate-applications";
import {
  ConsolidationSnapshotError,
  loadAvailableRateFacts,
  loadSelectedSourceFacts,
  periodEndDate,
  type ConsolidationRateFact,
  type ConsolidationScopeFact,
  type ConsolidationSourceFact,
} from "./consolidation-snapshots";
import { ChinaMoneyRateError } from "./chinamoney-exchange-rates";
import {
  ensureCapitalHistoricalAmountRate,
  ensureChinaMoneyCentralParityRate,
  ensureChinaMoneyMonthlyAverageRate,
  ensureVoucherHistoricalInvestmentRate,
} from "./exchange-rates";
import { consolidationSourcesReady } from "./consolidation-source-coverage";

type DraftBatch = NonNullable<Awaited<ReturnType<typeof loadConsolidationBatchRow>>>;

function flowMonthEnds(year: number, month: number) {
  return Array.from({ length: month }, (_, index) => periodEndDate(year, index + 1));
}

function cashPointDates(year: number, month: number) {
  return [...new Set([
    `${year - 1}-12-31`,
    periodEndDate(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1),
  ])];
}

function scopeFactsBySnapshotId(batch: DraftBatch) {
  return new Map(batch.entities.map((entity) => [entity.id, {
    companyId: entity.companyId,
    companyCode: entity.companyCode,
    companyName: entity.companyName,
    role: entity.role as ConsolidationScopeFact["role"],
    directParentCompanyId: entity.directParentCompanyId,
    directParentCode: entity.directParentCode,
    relationId: entity.relationId,
    relationUpdatedAt: entity.relationUpdatedAt,
    relationEffectiveFrom: entity.relationEffectiveFrom,
    relationEffectiveTo: entity.relationEffectiveTo,
    relationVersion: entity.relationVersion,
    shareRatio: entity.shareRatio === null ? null : Number(entity.shareRatio),
    isConsolidated: entity.isConsolidated,
    functionalCurrency: entity.functionalCurrency,
    currencyEvidence: entity.currencyEvidence,
    currencyDecidedBy: entity.currencyDecidedBy,
  } satisfies ConsolidationScopeFact]));
}

function frozenSourceFacts(batch: DraftBatch): ConsolidationSourceFact[] {
  const companyIdByEntitySnapshotId = new Map(
    batch.entities.map((entity) => [entity.id, entity.companyId]),
  );
  return batch.sources.map((source) => ({
    companyId: companyIdByEntitySnapshotId.get(source.entitySnapshotId)!,
    reportType: source.reportType as ConsolidationSourceFact["reportType"],
    sourceKind: source.sourceKind as ConsolidationSourceFact["sourceKind"],
    sourceStatus: source.sourceStatus as ConsolidationSourceFact["sourceStatus"],
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
    reportPayload: source.reportPayload as Prisma.InputJsonValue,
    fingerprint: source.fingerprint,
    evidence: source.evidence,
  }));
}

function automaticCurrencyPolicies(batch: DraftBatch): ConsolidationCurrencyPolicyFact[] | null {
  const policies = batch.entities.flatMap((entity) => {
    const currency = entity.functionalCurrency?.trim().toUpperCase();
    const evidence = entity.currencyEvidence?.trim();
    if ((currency !== "CNY" && currency !== "CAD") || !evidence) return [];
    return [{ entitySnapshotId: entity.id, functionalCurrency: currency, evidence }];
  });
  return policies.length === batch.entities.length ? policies : null;
}

async function loadAutomaticRateFacts(
  batch: DraftBatch,
  sources: ConsolidationSourceFact[],
  userId: number,
): Promise<ConsolidationRateFact[] | null> {
  const currencyPolicies = automaticCurrencyPolicies(batch);
  if (!currencyPolicies) return null;
  const cadEntityIds = new Set(currencyPolicies
    .filter((policy) => policy.functionalCurrency === "CAD")
    .map((policy) => policy.entitySnapshotId));
  if (cadEntityIds.size === 0) return [];

  const selectedPeriodEnd = periodEndDate(batch.year, batch.month);
  const comparativePeriodEnd = comparativePeriodEndDate(selectedPeriodEnd);
  const entitySnapshotIdByCompanyId = new Map(batch.entities.map((entity) => [entity.companyId, entity.id]));
  const requiredComparativeEntityIds = comparativeEntitySnapshotIds(sources.map((source) => ({
    entitySnapshotId: entitySnapshotIdByCompanyId.get(source.companyId)!,
    reportType: source.reportType,
    reportPayload: source.reportPayload,
  }))).filter((entityId) => cadEntityIds.has(entityId));
  const cadCompanyCodes = batch.entities
    .filter((entity) => cadEntityIds.has(entity.id))
    .map((entity) => entity.companyCode);
  const [rawHistoricalCapitalFacts, investmentFacts] = await Promise.all([
    loadHistoricalCapitalFacts(cadCompanyCodes, selectedPeriodEnd),
    loadCadInvestmentVoucherFacts(batch.entities.map((entity) => entity.companyCode), selectedPeriodEnd),
  ]);
  const cadEntities = batch.entities.filter((entity) => cadEntityIds.has(entity.id));
  const mappedInvestments = investmentFacts.flatMap((investment) => {
    const investor = batch.entities.find((entity) => entity.companyCode === investment.companyCode);
    const directCandidates = investor
      ? cadEntities.filter((entity) => entity.directParentCompanyId === investor.companyId)
      : [];
    if (investment.matchingCompanyCode) {
      const explicitCandidates = cadEntities.filter((entity) => entity.companyCode === investment.matchingCompanyCode);
      if (explicitCandidates.length !== 1) {
        throw new ConsolidationSnapshotError(
          `投资凭证 ${investment.voucherNo} 的匹配公司不在当前 CAD 合并主体内`,
          409,
        );
      }
      return [{ investment, entity: explicitCandidates[0]! }];
    }
    return directCandidates.length === 1 ? [{ investment, entity: directCandidates[0]! }] : [];
  });
  const historicalCapitalFacts = rawHistoricalCapitalFacts;
  const companiesWithCapitalFacts = new Set(historicalCapitalFacts.map((fact) => fact.companyCode));
  const uncoveredInvestments = mappedInvestments.filter(({ entity }) => !companiesWithCapitalFacts.has(entity.companyCode));
  const targetDates = [
    selectedPeriodEnd,
    ...(requiredComparativeEntityIds.length > 0 ? [comparativePeriodEnd] : []),
    ...cashPointDates(batch.year, batch.month),
    ...(requiredComparativeEntityIds.length > 0 ? cashPointDates(batch.year - 1, batch.month) : []),
    ...historicalCapitalFacts.flatMap((fact) => fact.capitalContributionDate ? [fact.capitalContributionDate] : []),
  ];
  const rateIdByTargetDate = new Map<string, number>();
  for (const targetDate of [...new Set(targetDates)].sort()) {
    const rate = await ensureChinaMoneyCentralParityRate({ currencyCode: "CAD", targetDate, userId });
    rateIdByTargetDate.set(targetDate, rate.id);
  }
  const rateIdByHistoricalSource = new Map<string, number>();
  for (const fact of historicalCapitalFacts) {
    if (!fact.historicalAmountCny) continue;
    const rate = await ensureCapitalHistoricalAmountRate({
      sourceKind: fact.basis === "opening" ? "accountBalance" : "voucherItem",
      sourceRecordId: fact.sourceRecordId,
      evidenceDate: fact.capitalEvidenceDate,
      originalCurrency: "CAD",
      originalAmount: fact.originalAmount,
      historicalAmountCny: fact.historicalAmountCny,
      evidence: fact.evidence,
      userId,
    });
    rateIdByHistoricalSource.set(`${fact.basis}:${fact.sourceRecordId}`, rate.id);
  }
  const monthlyRateIdByTargetDate = new Map<string, number>();
  for (const targetDate of [
    ...flowMonthEnds(batch.year, batch.month),
    ...(requiredComparativeEntityIds.length > 0 ? flowMonthEnds(batch.year - 1, batch.month) : []),
  ]) {
    const [year, month] = targetDate.split("-").map(Number);
    const rate = await ensureChinaMoneyMonthlyAverageRate({ currencyCode: "CAD", year, month, userId });
    monthlyRateIdByTargetDate.set(targetDate, rate.id);
  }
  const explicitRateIdByVoucherItemId = new Map<number, number>();
  for (const { investment } of uncoveredInvestments) {
    const originalAmount = investment.originalAmount!;
    const actualWeightedRate = Math.round((investment.bookedAmountCny / originalAmount) * 100_000_000) / 100_000_000;
    const rate = await ensureVoucherHistoricalInvestmentRate({
      voucherItemId: investment.id,
      contributionDate: investment.capitalContributionDate ?? investment.voucherDate,
      rate: actualWeightedRate,
      matchingLabel: investment.matchingLabel ?? `${investment.voucherNo} 实际人民币投资金额`,
      userId,
    });
    explicitRateIdByVoucherItemId.set(investment.id, rate.id);
  }
  const currentRateId = rateIdByTargetDate.get(selectedPeriodEnd)!;
  const comparativeRateId = rateIdByTargetDate.get(comparativePeriodEnd);
  const rateApplications: ConsolidationRateApplicationFact[] = cadEntities.flatMap((entity) => [{
    exchangeRateId: currentRateId,
    applicationType: "closing" as const,
    periodBasis: "current" as const,
    entitySnapshotId: entity.id,
    evidence: `${selectedPeriodEnd} 中国货币网人民币汇率中间价，由系统自动采用`,
  }, ...(comparativeRateId && requiredComparativeEntityIds.includes(entity.id) ? [{
    exchangeRateId: comparativeRateId,
    applicationType: "closing" as const,
    periodBasis: "comparative" as const,
    entitySnapshotId: entity.id,
    evidence: `${comparativePeriodEnd} 中国货币网人民币汇率中间价，由系统自动采用`,
  }] : [])]);
  for (const entity of cadEntities) {
    for (const targetDate of flowMonthEnds(batch.year, batch.month)) {
      rateApplications.push({
        exchangeRateId: monthlyRateIdByTargetDate.get(targetDate)!,
        applicationType: "flowAverage",
        periodBasis: "current",
        entitySnapshotId: entity.id,
        targetDate,
        evidence: `${targetDate.slice(0, 7)} 中国货币网全部有效交易日人民币汇率中间价算术平均`,
      });
    }
    if (requiredComparativeEntityIds.includes(entity.id)) {
      for (const targetDate of flowMonthEnds(batch.year - 1, batch.month)) {
        rateApplications.push({
          exchangeRateId: monthlyRateIdByTargetDate.get(targetDate)!,
          applicationType: "flowAverage",
          periodBasis: "comparative",
          entitySnapshotId: entity.id,
          targetDate,
          evidence: `${targetDate.slice(0, 7)} 中国货币网全部有效交易日人民币汇率中间价算术平均`,
        });
      }
    }
    for (const targetDate of cashPointDates(batch.year, batch.month)) {
      rateApplications.push({
        exchangeRateId: rateIdByTargetDate.get(targetDate)!,
        applicationType: "cashPoint",
        periodBasis: "current",
        entitySnapshotId: entity.id,
        targetDate,
        evidence: `${targetDate} 现金余额时点人民币汇率中间价`,
      });
    }
    if (requiredComparativeEntityIds.includes(entity.id)) {
      for (const targetDate of cashPointDates(batch.year - 1, batch.month)) {
        rateApplications.push({
          exchangeRateId: rateIdByTargetDate.get(targetDate)!,
          applicationType: "cashPoint",
          periodBasis: "comparative",
          entitySnapshotId: entity.id,
          targetDate,
          evidence: `${targetDate} 现金余额时点人民币汇率中间价`,
        });
      }
    }
  }
  const companyIdByCode = new Map(batch.entities.map((entity) => [entity.companyCode, entity.companyId]));
  const comparativeCompanyIds = new Set(batch.entities
    .filter((entity) => requiredComparativeEntityIds.includes(entity.id))
    .map((entity) => entity.companyId));
  rateApplications.push(...buildHistoricalCapitalRateApplications({
    facts: historicalCapitalFacts,
    rateIdByTargetDate,
    rateIdByHistoricalSource,
    comparativePeriodEnd,
    comparativeCompanyIds,
    companyIdByCode,
    snapshotIdByCompany: entitySnapshotIdByCompanyId,
  }));
  for (const { investment, entity } of uncoveredInvestments) {
    const exchangeRateId = explicitRateIdByVoucherItemId.get(investment.id)!;
    const contributionDate = investment.capitalContributionDate ?? investment.voucherDate;
    const actualWeightedRate = Math.round((investment.bookedAmountCny / investment.originalAmount!) * 100_000_000) / 100_000_000;
    const rateEvidence = `投资凭证 ${investment.voucherNo}：${investment.originalAmount} CAD 对应实际人民币投资金额 ${investment.bookedAmountCny} CNY；${contributionDate} 为实际出资日，加权汇率 ${actualWeightedRate} 由金额反算`;
    const shared = {
      exchangeRateId,
      applicationType: "historicalInvestment" as const,
      entitySnapshotId: entity.id,
      voucherItemId: investment.id,
      capitalHistoricalAmountCny: investment.bookedAmountCny,
      capitalEvidenceKind: "voucher" as const,
      capitalEvidenceDate: investment.voucherDate,
      capitalContributionDate: contributionDate,
      evidence: rateEvidence,
    };
    rateApplications.push({ ...shared, periodBasis: "current" });
    if ((investment.capitalContributionDate ?? investment.voucherDate) <= comparativePeriodEnd && requiredComparativeEntityIds.includes(entity.id)) {
      rateApplications.push({ ...shared, periodBasis: "comparative" });
    }
  }
  const selectedRateIds = [...new Set(rateApplications.map((application) => application.exchangeRateId))];
  const selectedRateFacts = await loadAvailableRateFacts(selectedPeriodEnd, selectedRateIds);
  const { rates } = await applyConsolidationRatePolicies({
    periodEnd: selectedPeriodEnd,
    requiredComparativeEntityIds,
    requiredInvestmentVoucherIds: uncoveredInvestments.map(({ investment }) => investment.id),
    companyCodes: batch.entities.map((entity) => entity.companyCode),
    entities: batch.entities,
    currencyPolicies,
    rateApplications,
    rateFacts: selectedRateFacts,
  });
  return rates;
}

function hasCompleteFx(batch: DraftBatch, preparedRates: ConsolidationRateFact[] | null) {
  const policies = automaticCurrencyPolicies(batch);
  if (!policies) return false;
  const cadEntityIds = policies.filter((policy) => policy.functionalCurrency === "CAD").map((policy) => policy.entitySnapshotId);
  if (cadEntityIds.length === 0) return true;
  const periodEnd = periodEndDate(batch.year, batch.month);
  const applications = (preparedRates ?? batch.exchangeRates).flatMap((rate) =>
    parseConsolidationRateApplications(rate.applications),
  );
  return cadEntityIds.every((entitySnapshotId) => applications.some((application) =>
    application.applicationType === "closing"
    && application.periodBasis === "current"
    && application.entitySnapshotId === entitySnapshotId
    && application.targetDate === periodEnd,
  ));
}

function automaticDecisions(
  batch: DraftBatch,
  sources: ConsolidationSourceFact[],
  preparedRates: ConsolidationRateFact[] | null,
) {
  const ownershipReady = batch.entities.every((entity) => entity.role !== "subsidiary"
    || entity.shareRatio !== null && Number(entity.shareRatio) > 0 && Number(entity.shareRatio) <= 1);
  const sourcesReady = consolidationSourcesReady(batch.entities.length, sources);
  const facts: Array<[ConsolidationControlKey, boolean, string]> = [
    ["scope", batch.entities.length > 1, `系统已冻结 ${batch.entities.length} 个合并主体`],
    ["ownership", ownershipReady, ownershipReady ? "系统已校验直接持股比例" : "直接持股比例尚未完整"],
    ["sources", sourcesReady, sourcesReady ? "个别三表均已就绪并自动保存快照" : "个别三表尚未全部就绪，不能生成合并工作底稿"],
    ["fx", hasCompleteFx(batch, preparedRates), hasCompleteFx(batch, preparedRates) ? "本位币与适用汇率已由系统自动采用" : "本位币或适用汇率尚未完整"],
    ["tax", true, "税务影响按当前产品口径不作为准备阶段前置项"],
  ];
  return facts.map(([controlKey, ready, evidence]) => ({
    controlKey,
    decision: ready ? "completed" as const : "requiresReview" as const,
    conclusion: ready ? "已就绪" : "未就绪",
    evidence,
  }));
}

export async function prepareConsolidationSources(rawCommand: SaveConsolidationSourcesCommand) {
  const validation = buildSaveConsolidationSourcesCommand(rawCommand.batchId, rawCommand.input, rawCommand.userId);
  if (!validation.ok) return serviceError(validation.issue.message, validation.issue.status);
  const command = validation.data;
  try {
    const batch = await loadConsolidationBatchRow(command.batchId);
    if (!batch) throw new ConsolidationSnapshotError("合并批次不存在", 404);
    if (batch.status !== "draft") throw new ConsolidationSnapshotError("只有草稿批次允许更新合并准备", 409);
    if (batch.revision !== command.input.expectedRevision) {
      throw new ConsolidationSnapshotError("合并批次已被其他人修改，请刷新后重试", 409);
    }
    const direct = await assertBusinessActionDirectExecutionAllowed({
      businessActionKey: "finance.statements.consolidationSources.save",
      actorUserId: command.userId,
      resourceKey: "finance.statements",
      scopeType: "global",
      scopeId: null,
      blockedMessage: "合并准备已配置为必须走流程，请从统一入口提交",
    });
    if (!direct.ok) return direct;
    const sourceFacts = command.input.intent === "refresh"
      ? await loadSelectedSourceFacts(
          scopeFactsBySnapshotId(batch),
          batch.year,
          batch.month,
          batch.periodKind as "year" | "quarter" | "month",
        )
      : frozenSourceFacts(batch);
    if (command.input.intent === "completePreparation"
      && !consolidationSourcesReady(batch.entities.length, sourceFacts)) {
      const missingCount = sourceFacts.filter((source) => source.sourceKind === "missing").length;
      throw new ConsolidationSnapshotError(`还有 ${missingCount} 份单体报表未就绪，不能生成合并工作底稿`, 409);
    }
    const companyIdByEntitySnapshotId = new Map(batch.entities.map((entity) => [entity.id, entity.companyId]));
    const currentSourceContent = consolidationSourceContentBatchFingerprint(batch.sources.map((source) => ({
      ...source,
      companyId: companyIdByEntitySnapshotId.get(source.entitySnapshotId)!,
    })));
    const nextSourceContent = consolidationSourceContentBatchFingerprint(sourceFacts);
    const sourcesChanged = currentSourceContent !== nextSourceContent;
    let preparedRates: ConsolidationRateFact[] | null = null;
    if (command.input.intent === "refresh"
      || sourcesChanged
      || !hasCompleteFx(batch, null)
      || !hasMonthlyAverageRateEvidence(batch.exchangeRates)) {
      try {
        preparedRates = await loadAutomaticRateFacts(batch, sourceFacts, command.userId);
      } catch (cause) {
        if (!(cause instanceof ChinaMoneyRateError) && !(cause instanceof ConsolidationSnapshotError)) throw cause;
        console.warn("Automatic consolidation rate preparation is not ready", cause.message);
      }
    }
    const ratesChanged = preparedRates !== null
      && consolidationRateFingerprint(preparedRates) !== batch.rateFingerprint;
    const decisions = command.input.intent === "completePreparation"
      ? automaticDecisions(batch, sourceFacts, preparedRates)
      : [];
    const existingDecisions = new Map(batch.controlDecisions.map((decision) => [decision.controlKey, decision]));
    const decisionsChanged = decisions.some((decision) => {
      const existing = existingDecisions.get(decision.controlKey);
      return !existing
        || existing.decision !== decision.decision
        || existing.conclusion !== decision.conclusion
        || existing.evidence !== decision.evidence;
    });
    if (!sourcesChanged && !ratesChanged && !decisionsChanged) {
      return serviceOk({ batch: consolidationBatchSnapshot(batch), changed: false });
    }
    const entitySnapshotIdByCompanyId = new Map(batch.entities.map((entity) => [entity.companyId, entity.id]));
    const row = await prisma.$transaction(async (tx) => {
      const batchRevision = await claimConsolidationBatchRevision(tx, {
        batchId: batch.id,
        status: "draft",
        expectedRevision: command.input.expectedRevision,
      });
      if (!batchRevision) throw new ConsolidationSnapshotError("合并批次已被其他人修改，请刷新后重试", 409);
      if (sourcesChanged) {
        for (const source of sourceFacts) {
          const entitySnapshotId = entitySnapshotIdByCompanyId.get(source.companyId)!;
          const data = {
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
          };
          await tx.financeConsolidationSourceSnapshot.upsert({
            where: { batchId_entitySnapshotId_reportType: { batchId: batch.id, entitySnapshotId, reportType: source.reportType } },
            create: { batchId: batch.id, entitySnapshotId, reportType: source.reportType, ...data },
            update: { ...data, selectedAt: new Date() },
          });
        }
      }
      if (ratesChanged && preparedRates) {
        await tx.financeConsolidationRateSnapshot.deleteMany({ where: { batchId: batch.id } });
        if (preparedRates.length > 0) {
          await tx.financeConsolidationRateSnapshot.createMany({
            data: preparedRates.map((rate) => ({ batchId: batch.id, ...rate })),
          });
        }
      }
      for (const decision of decisions) {
        await tx.financeConsolidationControlDecision.upsert({
          where: { batchId_controlKey: { batchId: batch.id, controlKey: decision.controlKey } },
          create: { batchId: batch.id, ...decision, decidedBy: command.userId },
          update: { ...decision, decidedBy: command.userId, decidedAt: new Date() },
        });
      }
      await tx.financeConsolidationBatch.update({
        where: { id: batch.id },
        data: {
          ...(sourcesChanged ? { sourceFingerprint: consolidationSourceBatchFingerprint(sourceFacts) } : {}),
          ...(ratesChanged && preparedRates ? { rateFingerprint: consolidationRateFingerprint(preparedRates) } : {}),
        },
      });
      return tx.financeConsolidationBatch.findUniqueOrThrow({
        where: { id: batch.id },
        include: CONSOLIDATION_BATCH_INCLUDE,
      });
    });
    return serviceOk({ batch: consolidationBatchSnapshot(row), changed: true });
  } catch (cause) {
    if (cause instanceof ConsolidationSnapshotError) return serviceError(cause.message, cause.status);
    throw cause;
  }
}
