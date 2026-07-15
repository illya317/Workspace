import {
  buildSaveConsolidationControlDecisionCommand,
  buildSaveConsolidationSourcesCommand,
  type SaveConsolidationControlDecisionCommand,
  type SaveConsolidationSourcesCommand,
} from "../domain/consolidation-batch-validation";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { prisma } from "@workspace/platform/server/prisma";
import {
  CONSOLIDATION_BATCH_INCLUDE,
  consolidationBatchSnapshot,
  loadConsolidationBatchRow,
} from "./consolidation-dto";
import {
  ConsolidationSnapshotError,
  assertConsolidationSourceFactsCurrent,
  loadSelectedSourceFacts,
  loadVerifiedRateFacts,
  periodEndDate,
  type ConsolidationScopeFact,
} from "./consolidation-snapshots";
import {
  consolidationRateFingerprint,
  consolidationScopeFingerprint,
  consolidationSourceBatchFingerprint,
} from "./consolidation-fingerprints";
import { applyConsolidationRatePolicies } from "./consolidation-rate-applications";
import {
  comparativeEntitySnapshotIds,
} from "./consolidation-comparative";
import { claimConsolidationBatchRevision } from "./consolidation-mutations";

async function requireDraftBatch(batchId: number) {
  const batch = await loadConsolidationBatchRow(batchId);
  if (!batch) throw new ConsolidationSnapshotError("合并批次不存在", 404);
  if (batch.status !== "draft") throw new ConsolidationSnapshotError("只有草稿批次允许更新冻结来源", 409);
  return batch;
}

function scopeFactsBySnapshotId(batch: Awaited<ReturnType<typeof requireDraftBatch>>) {
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
    functionalCurrency: entity.functionalCurrency,
    currencyEvidence: entity.currencyEvidence,
    currencyDecidedBy: entity.currencyDecidedBy,
  } satisfies ConsolidationScopeFact]));
}

export async function saveConsolidationSources(rawCommand: SaveConsolidationSourcesCommand) {
  const validation = buildSaveConsolidationSourcesCommand(rawCommand.batchId, rawCommand.input, rawCommand.userId);
  if (!validation.ok) return serviceError(validation.issue.message, validation.issue.status);
  const command = validation.data;
  try {
    const batch = await requireDraftBatch(command.batchId);
    const expectedSourceKeys = new Set(batch.entities.flatMap((entity) => [
      `${entity.id}:balanceSheet`,
      `${entity.id}:incomeStatement`,
      `${entity.id}:cashFlow`,
    ]));
    const selectedSourceKeys = new Set(command.input.selections.map((selection) =>
      `${selection.entitySnapshotId}:${selection.reportType}`,
    ));
    if (selectedSourceKeys.size !== expectedSourceKeys.size
      || [...expectedSourceKeys].some((key) => !selectedSourceKeys.has(key))) {
      throw new ConsolidationSnapshotError("来源保存必须完整提交批次内每个实体的三张报表", 409);
    }
    const direct = await assertBusinessActionDirectExecutionAllowed({
      businessActionKey: "finance.statements.consolidationSources.save",
      actorUserId: command.userId,
      resourceKey: "finance.statements",
      scopeType: "global",
      scopeId: null,
      blockedMessage: "个别报表来源保存已配置为必须走流程，请从统一保存入口提交",
    });
    if (!direct.ok) return direct;
    const periodEnd = periodEndDate(batch.year, batch.month);
    const sourceFacts = await loadSelectedSourceFacts(
      scopeFactsBySnapshotId(batch),
      batch.year,
      batch.month,
      command.input.selections,
    );
    const selectedRateFacts = await loadVerifiedRateFacts(
      periodEnd,
      command.input.exchangeRateIds,
    );
    const entitySnapshotIdByCompanyId = new Map(batch.entities.map((entity) => [entity.companyId, entity.id]));
    const cadEntityIds = new Set(command.input.currencyPolicies
      .filter((policy) => policy.functionalCurrency === "CAD")
      .map((policy) => policy.entitySnapshotId));
    const requiredComparativeEntityIds = comparativeEntitySnapshotIds(sourceFacts.map((source) => ({
      entitySnapshotId: entitySnapshotIdByCompanyId.get(source.companyId)!,
      reportType: source.reportType,
      reportPayload: source.reportPayload,
    }))).filter((entityId) => cadEntityIds.has(entityId));
    const { rates: rateFacts } = await applyConsolidationRatePolicies({
      periodEnd,
      requiredComparativeEntityIds,
      companyCodes: batch.entities.map((entity) => entity.companyCode),
      entities: batch.entities,
      currencyPolicies: command.input.currencyPolicies,
      rateApplications: command.input.rateApplications,
      rateFacts: selectedRateFacts,
    });
    const row = await prisma.$transaction(async (tx) => {
      const batchRevision = await claimConsolidationBatchRevision(tx, {
        batchId: batch.id,
        status: "draft",
        expectedRevision: command.input.expectedRevision,
      });
      if (!batchRevision) {
        throw new ConsolidationSnapshotError("合并批次已被提交或被其他人修改，请刷新后重试", 409);
      }
      await assertConsolidationSourceFactsCurrent(tx, sourceFacts, {
        year: batch.year,
        month: batch.month,
        companyCodeByCompanyId: new Map(batch.entities.map((entity) => [entity.companyId, entity.companyCode])),
      });
      for (const policy of command.input.currencyPolicies) {
        const updated = await tx.financeConsolidationEntitySnapshot.updateMany({
          where: { id: policy.entitySnapshotId, batchId: batch.id },
          data: {
            functionalCurrency: policy.functionalCurrency,
            currencyEvidence: policy.evidence,
            currencyDecidedBy: command.userId,
          },
        });
        if (updated.count !== 1) throw new ConsolidationSnapshotError("本位币政策引用了批次范围外实体", 409);
      }
      for (const source of sourceFacts) {
        const entitySnapshotId = command.input.selections.find((selection) => {
          const entity = batch.entities.find((candidate) => candidate.id === selection.entitySnapshotId);
          return entity?.companyId === source.companyId && selection.reportType === source.reportType;
        })!.entitySnapshotId;
        await tx.financeConsolidationSourceSnapshot.upsert({
          where: {
            batchId_entitySnapshotId_reportType: {
              batchId: batch.id,
              entitySnapshotId,
              reportType: source.reportType,
            },
          },
          create: {
            batchId: batch.id,
            entitySnapshotId,
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
          update: {
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
            selectedAt: new Date(),
          },
        });
      }
      await tx.financeConsolidationRateSnapshot.deleteMany({ where: { batchId: batch.id } });
      if (rateFacts.length > 0) {
        await tx.financeConsolidationRateSnapshot.createMany({
          data: rateFacts.map((rate) => ({ batchId: batch.id, ...rate })),
        });
      }
      const allSources = await tx.financeConsolidationSourceSnapshot.findMany({
        where: { batchId: batch.id },
        select: {
          fingerprint: true,
          reportType: true,
          entity: { select: { companyId: true } },
        },
        orderBy: [{ entitySnapshotId: "asc" }, { reportType: "asc" }],
      });
      const allEntities = await tx.financeConsolidationEntitySnapshot.findMany({
        where: { batchId: batch.id },
        orderBy: { companyId: "asc" },
      });
      await tx.financeConsolidationBatch.update({
        where: { id: batch.id },
        data: {
          scopeFingerprint: consolidationScopeFingerprint(allEntities),
          sourceFingerprint: consolidationSourceBatchFingerprint(allSources.map((source) => ({
            companyId: source.entity.companyId,
            reportType: source.reportType,
            fingerprint: source.fingerprint,
          }))),
          rateFingerprint: consolidationRateFingerprint(rateFacts),
        },
      });
      return tx.financeConsolidationBatch.findUniqueOrThrow({
        where: { id: batch.id },
        include: CONSOLIDATION_BATCH_INCLUDE,
      });
    });
    return serviceOk({ batch: consolidationBatchSnapshot(row) });
  } catch (cause) {
    if (cause instanceof ConsolidationSnapshotError) return serviceError(cause.message, cause.status);
    throw cause;
  }
}

export async function saveConsolidationControlDecision(rawCommand: SaveConsolidationControlDecisionCommand) {
  const validation = buildSaveConsolidationControlDecisionCommand(
    rawCommand.batchId,
    rawCommand.input,
    rawCommand.userId,
  );
  if (!validation.ok) return serviceError(validation.issue.message, validation.issue.status);
  const command = validation.data;
  try {
    const batch = await requireDraftBatch(command.batchId);
    const direct = await assertBusinessActionDirectExecutionAllowed({
      businessActionKey: "finance.statements.consolidationControl.resolve",
      actorUserId: command.userId,
      resourceKey: "finance.statements",
      scopeType: "global",
      scopeId: null,
      blockedMessage: "合并控制结论保存已配置为必须走流程，请从统一保存入口提交",
    });
    if (!direct.ok) return direct;
    const row = await prisma.$transaction(async (tx) => {
      const batchRevision = await claimConsolidationBatchRevision(tx, {
        batchId: batch.id,
        status: "draft",
        expectedRevision: command.input.expectedRevision,
      });
      if (!batchRevision) {
        throw new ConsolidationSnapshotError("合并批次已被提交或被其他人修改，请刷新后重试", 409);
      }
      const decisionData = {
        controlKey: command.input.controlKey,
        decision: command.input.decision,
        conclusion: command.input.conclusion,
        evidence: command.input.evidence,
      };
      await tx.financeConsolidationControlDecision.upsert({
        where: { batchId_controlKey: { batchId: batch.id, controlKey: command.input.controlKey } },
        create: { batchId: batch.id, ...decisionData, decidedBy: command.userId },
        update: { ...decisionData, decidedBy: command.userId, decidedAt: new Date() },
      });
      return tx.financeConsolidationBatch.findUniqueOrThrow({
        where: { id: batch.id },
        include: CONSOLIDATION_BATCH_INCLUDE,
      });
    });
    return serviceOk({ batch: consolidationBatchSnapshot(row) });
  } catch (cause) {
    if (cause instanceof ConsolidationSnapshotError) return serviceError(cause.message, cause.status);
    throw cause;
  }
}
