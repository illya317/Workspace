import {
  buildEnsureConsolidationBatchCommand,
  type EnsureConsolidationBatchCommand,
} from "../domain/consolidation-batch-validation";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { resolveUserEmployeeName } from "@workspace/platform/server/user-identity";
import {
  CONSOLIDATION_BATCH_INCLUDE,
  consolidationBatchSnapshot,
  loadConsolidationBatchRow,
} from "./consolidation-dto";
import {
  ConsolidationSnapshotError,
  assertConsolidationSourceFactsCurrent,
  loadConsolidationScopeFacts,
  loadInitialSourceFacts,
  loadVerifiedRateFacts,
  periodEndDate,
} from "./consolidation-snapshots";
import {
  consolidationRateFingerprint,
  consolidationScopeFingerprint,
  consolidationSourceBatchFingerprint,
} from "./consolidation-fingerprints";
import { appendConsolidationBatchEvent } from "./consolidation-mutations";

function snapshotError(cause: unknown) {
  if (cause instanceof ConsolidationSnapshotError) return serviceError(cause.message, cause.status);
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

async function loadBaseBatch(command: EnsureConsolidationBatchCommand) {
  const { input } = command;
  const latest = await prisma.financeConsolidationBatch.findFirst({
    where: {
      parentCompanyId: input.parentCompanyId,
      year: input.year,
      month: input.month,
    },
    include: CONSOLIDATION_BATCH_INCLUDE,
    orderBy: { version: "desc" },
  });
  if (!input.baseBatchId) {
    if (latest?.status === "draft") return { existing: latest, base: null, latest };
    if (latest && (latest.status === "submitted" || latest.status === "reviewed")) {
      throw new ConsolidationSnapshotError("当前期间已有待复核批次，不能并行创建新版本", 409);
    }
    return { existing: null, base: latest?.status === "locked" || latest?.status === "published" ? latest : null, latest };
  }
  const base = await loadConsolidationBatchRow(input.baseBatchId);
  if (!base) throw new ConsolidationSnapshotError("基础合并批次不存在", 404);
  if (base.parentCompanyId !== input.parentCompanyId || base.year !== input.year || base.month !== input.month) {
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

function cloneEntryData(
  entry: NonNullable<Awaited<ReturnType<typeof loadConsolidationBatchRow>>>["entries"][number],
  userId: number,
) {
  return {
    entryNo: entry.entryNo,
    entryType: entry.entryType,
    title: entry.title,
    description: entry.description,
    evidence: entry.evidence,
    status: "draft",
    version: entry.version + 1,
    supersedesEntryId: entry.id,
    predecessorEntryId: entry.id,
    preparedBy: userId,
    lines: {
      create: entry.lines.map((line) => ({
        lineNo: line.lineNo,
        companyId: line.companyId,
        companyCode: line.companyCode,
        statementType: line.statementType,
        lineCode: line.lineCode,
        accountCode: line.accountCode,
        debit: line.debit,
        credit: line.credit,
        currencyCode: line.currencyCode,
        note: line.note,
      })),
    },
    taxEffects: {
      create: entry.taxEffects.map((tax) => ({
        effectKey: tax.effectKey,
        taxEffectType: tax.taxEffectType,
        differenceAmount: tax.differenceAmount,
        taxRate: tax.taxRate,
        recognition: tax.recognition,
        reversalPeriod: tax.reversalPeriod,
        recoverabilityConclusion: tax.recoverabilityConclusion,
        evidence: tax.evidence,
        preparedBy: userId,
      })),
    },
  };
}

export async function ensureConsolidationBatch(rawCommand: EnsureConsolidationBatchCommand) {
  const validation = buildEnsureConsolidationBatchCommand(rawCommand.input, rawCommand.userId);
  if (!validation.ok) return serviceError(validation.issue.message, validation.issue.status);
  const command = validation.data;
  try {
    const { existing, base, latest } = await loadBaseBatch(command);
    if (existing) return serviceOk({ batch: consolidationBatchSnapshot(existing), created: false });
    const direct = await assertBusinessActionDirectExecutionAllowed({
      businessActionKey: "finance.statements.consolidationBatch.ensure",
      actorUserId: command.userId,
      resourceKey: "finance.statements",
      scopeType: "global",
      scopeId: null,
      blockedMessage: "合并批次创建已配置为必须走流程，请从统一保存入口提交",
    });
    if (!direct.ok) return direct;
    const actorName = await resolveUserEmployeeName(command.userId);
    if (!actorName) return serviceError("当前账号缺少员工身份，不能创建合并批次", 409);
    const scope = await loadConsolidationScopeFacts(
      command.input.parentCompanyId,
      periodEndDate(command.input.year, command.input.month),
    );
    const sources = await loadInitialSourceFacts(scope, command.input.year, command.input.month);
    const rates = await loadVerifiedRateFacts(periodEndDate(command.input.year, command.input.month));
    const version = (latest?.version ?? 0) + 1;
    const scopeFingerprint = consolidationScopeFingerprint(scope);
    const sourceFingerprint = consolidationSourceBatchFingerprint(sources);
    const rateFingerprint = consolidationRateFingerprint(rates);
    const parent = scope[0]!;
    const row = await prisma.$transaction(async (tx) => {
      const currentLatest = await tx.financeConsolidationBatch.findFirst({
        where: {
          parentCompanyId: command.input.parentCompanyId,
          year: command.input.year,
          month: command.input.month,
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
      await assertConsolidationSourceFactsCurrent(tx, sources, {
        year: command.input.year,
        month: command.input.month,
        companyCodeByCompanyId: new Map(scope.map((entity) => [entity.companyId, entity.companyCode])),
      });
      const batch = await tx.financeConsolidationBatch.create({
        data: {
          parentCompanyId: parent.companyId,
          parentCompanyCode: parent.companyCode,
          parentCompanyName: parent.companyName,
          year: command.input.year,
          month: command.input.month,
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
        note: base ? `基于合并批次 ${base.id} 创建版本` : null,
        actorUserId: command.userId,
        actorName,
        batchRevision: 1,
      });
      const snapshotIdByCompany = new Map<number, number>();
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
            functionalCurrency: entity.functionalCurrency,
            currencyEvidence: entity.currencyEvidence,
            currencyDecidedBy: entity.currencyDecidedBy,
          },
        });
        snapshotIdByCompany.set(entity.companyId, snapshot.id);
      }
      for (const source of sources) {
        await tx.financeConsolidationSourceSnapshot.create({
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
      }
      if (rates.length > 0) {
        await tx.financeConsolidationRateSnapshot.createMany({
          data: rates.map((rate) => ({
            batchId: batch.id,
            ...rate,
          })),
        });
      }
      for (const entry of base?.entries.filter((item) => item.status === "approved") ?? []) {
        await tx.financeConsolidationEntry.create({
          data: { batchId: batch.id, ...cloneEntryData(entry, command.userId) },
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
