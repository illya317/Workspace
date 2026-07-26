import type { ConsolidationBatchLifecycleCommand } from "../domain/consolidation-batch-validation";
import {
  validateConsolidationBatchTransition,
  validateConsolidationSubmission,
} from "../domain/consolidation-batch-validation";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { prisma } from "@workspace/platform/server/prisma";
import { resolveUserBusinessActorName } from "@workspace/platform/server/user-identity";
import {
  CONSOLIDATION_BATCH_INCLUDE,
  consolidationBatchSnapshot,
  loadConsolidationBatchRow,
} from "./consolidation-dto";
import { prepareLockedConsolidatedOutputSnapshot } from "./consolidated-output-service";
import {
  persistConsolidatedOutputSnapshot,
  readConsolidatedOutputSnapshot,
  type PreparedConsolidatedOutputSnapshot,
} from "./consolidated-output-snapshots";
import { buildConsolidationReplayPackage } from "./consolidation-replay";
import { periodEndDate } from "./consolidation-snapshots";
import { parseConsolidationRateApplications } from "./consolidation-rate-applications";

const ACTION_KEYS = {
  submit: "finance.statements.consolidationBatch.submit",
  return: "finance.statements.consolidationBatch.return",
  review: "finance.statements.consolidationBatch.review",
  lock: "finance.statements.consolidationBatch.lock",
  publish: "finance.statements.consolidationBatch.publish",
} as const;

const ACTION_MESSAGES = {
  submit: "合并批次提交已配置为必须走流程，请从统一入口提交",
  return: "合并批次退回已配置为必须走流程，请从统一入口提交",
  review: "合并批次复核已配置为必须走流程，请从统一入口提交",
  lock: "合并批次锁定已配置为必须走流程，请从统一入口提交",
  publish: "合并批次发布已配置为必须走流程，请从统一入口提交",
} as const;

class ConsolidationLifecycleError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
  }
}

async function validateSubmissionFacts(batch: NonNullable<Awaited<ReturnType<typeof loadConsolidationBatchRow>>>) {
  const periodEnd = periodEndDate(batch.year, batch.month);
  const result = validateConsolidationSubmission({
    entities: batch.entities.map((entity) => ({
      id: entity.id,
      companyId: entity.companyId,
      role: entity.role,
      directParentCompanyId: entity.directParentCompanyId,
      shareRatio: entity.shareRatio === null ? null : Number(entity.shareRatio),
      functionalCurrency: entity.functionalCurrency,
      currencyEvidence: entity.currencyEvidence,
    })),
    sources: batch.sources.map((source) => ({
      entitySnapshotId: source.entitySnapshotId,
      reportType: source.reportType as "balanceSheet" | "incomeStatement" | "cashFlow",
      sourceKind: source.sourceKind,
      sourceStatus: source.sourceStatus,
      workpaperId: source.workpaperId,
      workpaperVersion: source.workpaperVersion,
      evidence: source.evidence,
      reportPayload: source.reportPayload,
    })),
    exchangeRates: batch.exchangeRates.map((rate) => ({
      exchangeRateId: rate.exchangeRateId,
      rateKind: rate.rateKind,
      rateDate: rate.rateDate,
      recordedBy: rate.recordedBy,
      recordedAt: rate.recordedAt?.toISOString() ?? null,
      applications: parseConsolidationRateApplications(rate.applications),
    })),
    controlDecisions: batch.controlDecisions.map((decision) => ({
      controlKey: decision.controlKey,
      decision: decision.decision,
      evidence: decision.evidence,
    })),
    entries: batch.entries.map((entry) => ({
      entryType: entry.entryType,
      matchDifference: entry.matchDifference === null ? null : Number(entry.matchDifference),
      differenceResolution: entry.differenceResolution,
      lines: entry.lines.map((line) => ({
        companyId: line.companyId,
        statementType: line.statementType as "balanceSheet" | "incomeStatement" | "cashFlow",
        lineCode: line.lineCode,
        periodBasis: line.periodBasis as "current" | "comparative",
        debit: Number(line.debit),
        credit: Number(line.credit),
        matchSide: line.matchSide as "left" | "right" | null,
        sourceKind: line.sourceKind,
        sourceId: line.sourceId,
        sourceFingerprint: line.sourceFingerprint,
        sourceAmount: line.sourceAmount === null ? null : Number(line.sourceAmount),
        sourceCurrency: line.sourceCurrency,
        counterpartyCompanyId: line.counterpartyCompanyId,
      })),
    })),
    taxEffectCount: batch.entries.reduce((sum, entry) => sum + entry.taxEffects.length, 0),
    taxEffects: batch.entries.flatMap((entry) => entry.taxEffects.map((tax) => ({
      recognition: tax.recognition,
      entitySnapshotId: tax.entitySnapshotId,
      jurisdiction: tax.jurisdiction,
      recognitionLocation: tax.recognitionLocation,
      balanceSheetLineCode: tax.balanceSheetLineCode,
      counterpartLineCode: tax.counterpartLineCode,
    }))),
    requiredInvestmentVoucherIds: [],
    periodEnd,
  });
  return result.ok ? null : serviceError(result.issue.message, result.issue.status);
}

export async function executeConsolidationBatchLifecycle(command: ConsolidationBatchLifecycleCommand) {
  const batch = await loadConsolidationBatchRow(command.batchId);
  if (!batch) return serviceError("合并批次不存在", 404);
  if (batch.revision !== command.expectedRevision) {
    return serviceError("合并批次内容已变化，请刷新后重试", 409);
  }
  const contributorUserIds = [
    ...batch.sources.flatMap((source) => [
      source.selectedBy,
      source.workpaperUpdatedBy,
      source.sourcePackageUploadedBy,
      source.sourcePackageSubmittedBy,
    ]),
    ...batch.controlDecisions.map((decision) => decision.decidedBy),
    ...batch.entries.flatMap((entry) => [
      entry.preparedBy,
      ...entry.taxEffects.map((tax) => tax.preparedBy),
    ]),
  ].filter((userId): userId is number => userId !== null);
  const transition = validateConsolidationBatchTransition({
    status: batch.status as "draft" | "submitted" | "reviewed" | "locked" | "published",
    createdBy: batch.createdBy,
    submittedBy: batch.submittedBy,
    reviewedBy: batch.reviewedBy,
    contributorUserIds,
  }, command.action, command.userId);
  if (!transition.ok) return serviceError(transition.issue.message, transition.issue.status);
  if (command.action === "submit") {
    const invalid = await validateSubmissionFacts(batch);
    if (invalid) return invalid;
  }
  if (command.action === "lock") {
    if (batch.entries.some((entry) => entry.status !== "approved")) {
      return serviceError("批次仍有未批准抵销分录，不能锁定", 409);
    }
    if (batch.sources.some((source) => source.reportPayload === null || typeof source.reportPayload !== "object")) {
      return serviceError("批次存在无法重放的来源快照，不能锁定", 409);
    }
  }
  if (command.action === "publish") {
    const output = readConsolidatedOutputSnapshot(
      batch.outputSnapshot,
      batch.id,
      consolidationBatchSnapshot(batch),
    );
    if (!output.ok) return serviceError(`合并报表不可发布：${output.issue.message}`, output.issue.status);
  }
  const direct = await assertBusinessActionDirectExecutionAllowed({
    businessActionKey: ACTION_KEYS[command.action],
    actorUserId: command.userId,
    resourceKey: "finance.statements",
    scopeType: "global",
    scopeId: null,
    blockedMessage: ACTION_MESSAGES[command.action],
  });
  if (!direct.ok) return direct;
  const actorName = await resolveUserBusinessActorName(command.userId);
  if (!actorName) return serviceError("当前账号缺少员工身份且不是管理员，不能处理合并批次", 409);
  const now = new Date();
  let preparedOutputSnapshot: PreparedConsolidatedOutputSnapshot | null = null;
  if (command.action === "lock") {
    const output = prepareLockedConsolidatedOutputSnapshot(
      consolidationBatchSnapshot(batch),
      command.userId,
      now,
    );
    if (!output.ok) return serviceError(`合并输出校验失败：${output.issue.message}`, output.issue.status);
    preparedOutputSnapshot = output.data;
  }
  try {
    const row = await prisma.$transaction(async (tx) => {
      const lifecycleData = command.action === "submit"
        ? { status: transition.data.nextStatus, submittedBy: command.userId, submittedAt: now }
        : command.action === "return"
          ? {
              status: transition.data.nextStatus,
              submittedBy: null,
              submittedAt: null,
              reviewedBy: null,
              reviewedAt: null,
              reviewNote: null,
            }
          : command.action === "review"
            ? { status: transition.data.nextStatus, reviewedBy: command.userId, reviewedAt: now, reviewNote: command.note }
            : command.action === "lock"
              ? { status: transition.data.nextStatus, lockedBy: command.userId, lockedAt: now }
              : { status: transition.data.nextStatus, publishedBy: command.userId, publishedAt: now };
      const claimed = await tx.financeConsolidationBatch.updateMany({
        where: {
          id: batch.id,
          status: batch.status,
          revision: command.expectedRevision,
        },
        data: {
          ...lifecycleData,
          revision: { increment: 1 },
        },
      });
      if (claimed.count !== 1) {
        throw new ConsolidationLifecycleError("合并批次状态或内容已变化，请刷新后重试");
      }
      if (command.action === "submit") {
        await tx.financeConsolidationEntry.updateMany({
          where: { batchId: batch.id, status: "draft" },
          data: { status: "submitted", submittedBy: command.userId, submittedAt: now },
        });
      } else if (command.action === "return") {
        await tx.financeConsolidationEntry.updateMany({
          where: { batchId: batch.id, status: { in: ["submitted", "approved"] } },
          data: {
            status: "draft",
            submittedBy: null,
            submittedAt: null,
            approvedBy: null,
            approvedAt: null,
            approvalNote: null,
          },
        });
      } else if (command.action === "review") {
        await tx.financeConsolidationEntry.updateMany({
          where: { batchId: batch.id, status: "submitted" },
          data: { status: "approved", approvedBy: command.userId, approvedAt: now, approvalNote: command.note },
        });
      }
      await tx.financeConsolidationBatchEvent.create({
        data: {
          batchId: batch.id,
          eventType: "lifecycle",
          action: command.action,
          fromStatus: batch.status,
          toStatus: transition.data.nextStatus,
          note: command.note,
          actorUserId: command.userId,
          actorName,
          batchRevision: command.expectedRevision + 1,
        },
      });
      if (preparedOutputSnapshot) {
        await persistConsolidatedOutputSnapshot(tx, preparedOutputSnapshot);
      }
      return tx.financeConsolidationBatch.findUniqueOrThrow({
        where: { id: batch.id },
        include: CONSOLIDATION_BATCH_INCLUDE,
      });
    });
    return serviceOk({ batch: consolidationBatchSnapshot(row) });
  } catch (cause) {
    if (cause instanceof ConsolidationLifecycleError) return serviceError(cause.message, cause.status);
    throw cause;
  }
}

export async function loadConsolidationReplayPackage(batchId: number) {
  const batch = await loadConsolidationBatchRow(batchId);
  if (!batch) return serviceError("合并批次不存在", 404);
  const replay = buildConsolidationReplayPackage(consolidationBatchSnapshot(batch));
  return replay.ok ? serviceOk({ replay: replay.data }) : serviceError(replay.issue.message, replay.issue.status);
}
