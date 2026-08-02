import type {
  DeleteConsolidationEntryCommand,
  DeleteConsolidationTaxEffectCommand,
  SaveConsolidationEntryCommand,
  SaveConsolidationTaxEffectCommand,
} from "../domain/consolidation-entry-validation";
import {
  buildDeleteConsolidationEntryCommand,
  buildDeleteConsolidationTaxEffectCommand,
  buildSaveConsolidationEntryCommand,
  buildSaveConsolidationTaxEffectCommand,
  isExactConsolidationReversal,
  validateConsolidationEntryWriteMode,
  validateConsolidationVersionTarget,
} from "../domain/consolidation-entry-validation";
import { serviceError, serviceOk } from "@workspace/platform/service-result";
import { guardedDelete } from "@workspace/platform/server/delete-guard";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { resolveUserBusinessActorName } from "@workspace/platform/server/user-identity";
import {
  CONSOLIDATION_BATCH_INCLUDE,
  consolidationBatchSnapshot,
} from "./consolidation-dto";
import {
  appendConsolidationBatchEvent,
  claimConsolidationBatchRevision,
  immutableAuditSnapshot,
} from "./consolidation-mutations";
import { resolveConsolidationEntrySource } from "./consolidation-entry-sources";
import {
  ConsolidationEntryError,
  directAction,
  loadDraftBatch,
} from "./consolidation-entry-write-context";
import { resolveSavedGroupVoucherNumber } from "./group-voucher-numbering";

async function loadVersionTarget(
  id: number,
  batch: Awaited<ReturnType<typeof loadDraftBatch>>,
) {
  const entry = await prisma.financeConsolidationEntry.findUnique({
    where: { id },
    include: {
      lines: true,
      successor: { select: { id: true } },
      revisions: { select: { id: true } },
      reversalEntries: { select: { id: true } },
    },
  });
  if (!entry) throw new ConsolidationEntryError("被修订或冲销的分录不存在", 404);
  const validation = validateConsolidationVersionTarget(
    { baseBatchId: batch.baseBatchId },
    {
      batchId: entry.batchId,
      status: entry.status,
      hasSuccessor: Boolean(entry.successor || entry.revisions.length || entry.reversalEntries.length),
    },
  );
  if (!validation.ok) {
    throw new ConsolidationEntryError(validation.issue.message, validation.issue.status);
  }
  return entry;
}

async function lineData(
  command: SaveConsolidationEntryCommand,
  batch: Awaited<ReturnType<typeof loadDraftBatch>>,
) {
  const entityById = new Map(batch.entities.map((entity) => [entity.id, entity]));
  const explicitCounterpartyIds = [...new Set(command.input.lines.map((line) => line.counterpartyCompanyId).filter((id): id is number => Boolean(id)))];
  const explicitCounterparties = explicitCounterpartyIds.length
    ? await prisma.company.findMany({ where: { id: { in: explicitCounterpartyIds } }, select: { id: true } })
    : [];
  const validCounterpartyCompanyIds = new Set(explicitCounterparties.map((company) => company.id));
  const matchedEntry = ["intercompanyBalance", "internalTrading", "cashFlow"].includes(command.input.entryType);
  const lines = await Promise.all(command.input.lines.map(async (line, index) => {
    const entity = entityById.get(line.entitySnapshotId);
    if (!entity) throw new ConsolidationEntryError("抵销分录引用了批次范围外主体", 409);
    const counterparty = line.counterpartyEntitySnapshotId ? entityById.get(line.counterpartyEntitySnapshotId) : null;
    if (line.counterpartyEntitySnapshotId && !counterparty) {
      throw new ConsolidationEntryError("结构化配对引用了批次范围外对方主体", 409);
    }
    if (line.counterpartyCompanyId && !validCounterpartyCompanyIds.has(line.counterpartyCompanyId)) {
      throw new ConsolidationEntryError("集团凭证引用的对方公司不存在", 409);
    }
    let source = {
      sourceId: null as string | null,
      sourceFingerprint: null as string | null,
      sourceAmount: null as number | null,
      sourceCurrency: null as string | null,
      sourceSnapshotId: null as number | null,
      sourceAuxiliaryBalanceId: null as number | null,
      sourceOpenItemId: null as number | null,
      sourceCashFlowAllocationId: null as number | null,
      sourceVoucherItemId: null as number | null,
    };
    if (matchedEntry && line.sourceKind && line.sourceRecordId) {
      try {
        source = await resolveConsolidationEntrySource({
          batchId: batch.id,
          entitySnapshotId: line.entitySnapshotId,
          sourceKind: line.sourceKind,
          sourceRecordId: line.sourceRecordId,
          reportType: line.statementType,
          lineCode: line.lineCode,
          periodBasis: line.periodBasis || "current",
        });
      } catch (cause) {
        throw new ConsolidationEntryError(cause instanceof Error ? cause.message : "匹配来源读取失败", 409);
      }
    }
    return {
      lineNo: index + 1,
      entitySnapshotId: entity.id,
      companyId: entity.companyId,
      companyCode: entity.companyCode,
      statementType: line.statementType,
      lineCode: line.lineCode,
      accountCode: line.accountCode,
      groupAccountId: line.groupAccountId,
      debit: line.debit,
      credit: line.credit,
      currencyCode: line.currencyCode || "CNY",
      periodBasis: line.periodBasis || "current",
      note: line.note,
      matchSide: line.matchSide,
      sourceKind: line.sourceKind,
      ...source,
      counterpartyEntitySnapshotId: counterparty?.id ?? null,
      counterpartyCompanyId: counterparty?.companyId ?? line.counterpartyCompanyId ?? null,
    };
  }));
  if (!matchedEntry) return { lines, matchDifference: null, differenceResolution: command.input.differenceResolution };
  const left = lines.filter((line) => line.matchSide === "left").reduce((sum, line) => sum + (line.sourceAmount ?? 0), 0);
  const right = lines.filter((line) => line.matchSide === "right").reduce((sum, line) => sum + (line.sourceAmount ?? 0), 0);
  if (left <= 0 || right <= 0) throw new ConsolidationEntryError("结构化配对必须同时包含左右两侧来源", 409);
  const matchDifference = Math.round(Math.abs(left - right) * 100) / 100;
  if (matchDifference > 0 && !command.input.differenceResolution?.trim()) {
    throw new ConsolidationEntryError("配对存在差额时必须填写差额处置", 409);
  }
  return {
    lines,
    matchDifference,
    differenceResolution: command.input.differenceResolution?.trim() || "双方来源金额一致，无待处置差额",
  };
}

function reportPayloadLines(reportType: string, value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const envelope = value as Record<string, unknown>;
  const payloadValue = envelope.payload ?? envelope;
  if (!payloadValue || typeof payloadValue !== "object" || Array.isArray(payloadValue)) return [];
  const payload = payloadValue as Record<string, unknown>;
  const rows = reportType === "balanceSheet"
    ? [payload.assets, payload.liabilities, payload.equity].flatMap((part) => Array.isArray(part) ? part : [])
    : Array.isArray(payload.lines) ? payload.lines : [];
  return rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row));
}

function validateEntryLineTargets(
  batch: Awaited<ReturnType<typeof loadDraftBatch>>,
  lines: Awaited<ReturnType<typeof lineData>>["lines"],
) {
  for (const line of lines) {
    const source = batch.sources.find((candidate) => (
      candidate.entitySnapshotId === line.entitySnapshotId
      && candidate.reportType === line.statementType
    ));
    const target = source && reportPayloadLines(line.statementType, source.reportPayload)
      .find((candidate) => candidate.lineCode === line.lineCode);
    if (!target) {
      throw new ConsolidationEntryError(`抵销分录报表行 ${line.companyCode}/${line.statementType}/${line.lineCode} 不在冻结来源中`, 409);
    }
    if (target.isHeader === true || target.isTotal === true || target.isGrandTotal === true || target.direction === "net") {
      throw new ConsolidationEntryError(`抵销分录不能直接写入派生报表行 ${line.lineCode}`, 409);
    }
  }
}

export async function saveConsolidationEntry(rawCommand: SaveConsolidationEntryCommand) {
  const validation = buildSaveConsolidationEntryCommand(rawCommand.batchId, rawCommand.input, rawCommand.userId);
  if (!validation.ok) return serviceError(validation.issue.message, validation.issue.status);
  const command = validation.data;
  try {
    const batch = await loadDraftBatch(command.batchId);
    const direct = await directAction(
      "finance.statements.consolidationEntry.save",
      command.userId,
      "抵销分录保存已配置为必须走流程，请从统一保存入口提交",
    );
    if (!direct.ok) return direct;
    const existing = command.input.entryId
      ? await prisma.financeConsolidationEntry.findUnique({ where: { id: command.input.entryId } })
      : null;
    if (existing && existing.batchId !== batch.id) throw new ConsolidationEntryError("抵销分录不属于当前批次", 409);
    const writeMode = validateConsolidationEntryWriteMode(batch.status, existing?.status as "draft" | "submitted" | "approved" | "reversed" | null);
    if (!writeMode.ok) return serviceError(writeMode.issue.message, writeMode.issue.status);
    const resolved = await lineData(command, batch);
    const { lines, matchDifference, differenceResolution } = resolved;
    validateEntryLineTargets(batch, lines);
    const supersedes = command.input.supersedesEntryId
      ? await loadVersionTarget(command.input.supersedesEntryId, batch)
      : null;
    const reversal = command.input.reversalOfEntryId
      ? await loadVersionTarget(command.input.reversalOfEntryId, batch)
      : null;
    if (supersedes && supersedes.entryNo !== command.input.entryNo) {
      throw new ConsolidationEntryError("修订分录必须沿用原分录编号", 409);
    }
    if ((supersedes || reversal) && (supersedes ?? reversal)!.entryType !== command.input.entryType) {
      throw new ConsolidationEntryError("修订或冲销分录必须沿用原分录类型", 409);
    }
    if (reversal && !isExactConsolidationReversal(reversal.lines, command.input.lines)) {
      throw new ConsolidationEntryError("冲销分录必须逐行反向原批准分录", 409);
    }
    const row = await prisma.$transaction(async (tx) => {
      const batchRevision = await claimConsolidationBatchRevision(tx, {
        batchId: batch.id,
        status: "draft",
        expectedRevision: command.input.expectedRevision,
      });
      if (!batchRevision) {
        throw new ConsolidationEntryError("合并批次已被提交或被其他人修改，请刷新后重试", 409);
      }
      const postingDate = command.input.postingDate ?? new Date(Date.UTC(batch.year, batch.month, 0)).toISOString().slice(0, 10);
      const entryNo = await resolveSavedGroupVoucherNumber(tx, {
        batchId: batch.id, year: batch.year, month: batch.month,
        existingEntryNumber: existing?.entryNo, supersededEntryNumber: supersedes?.entryNo,
      });
      let entryId: number;
      if (writeMode.data.mode === "updateDraft" && existing) {
        await tx.financeConsolidationEntryLine.deleteMany({ where: { entryId: existing.id } });
        const updated = await tx.financeConsolidationEntry.update({
          where: { id: existing.id },
          data: {
            entryNo,
            postingDate,
            documentType: command.input.documentType ?? "groupAdjustment",
            postingLevel: command.input.postingLevel ?? "30",
            entryType: command.input.entryType,
            title: command.input.title,
            description: command.input.description,
            evidence: command.input.evidence,
            matchDifference,
            differenceResolution,
            preparedBy: command.userId,
            lines: { create: lines },
          },
        });
        entryId = updated.id;
      } else {
        const created = await tx.financeConsolidationEntry.create({
          data: {
            batchId: batch.id,
            entryNo,
            postingDate,
            documentType: command.input.documentType ?? "groupAdjustment",
            postingLevel: command.input.postingLevel ?? "30",
            entryType: command.input.entryType,
            title: command.input.title,
            description: command.input.description,
            evidence: command.input.evidence,
            matchDifference,
            differenceResolution,
            version: supersedes || reversal ? (supersedes ?? reversal)!.version + 1 : 1,
            supersedesEntryId: supersedes?.id ?? null,
            reversalOfEntryId: reversal?.id ?? null,
            predecessorEntryId: supersedes?.id ?? reversal?.id ?? null,
            preparedBy: command.userId,
            lines: { create: lines },
          },
        });
        entryId = created.id;
      }
      const entry = await tx.financeConsolidationEntry.findUniqueOrThrow({
        where: { id: entryId },
        include: { lines: { orderBy: { lineNo: "asc" } }, taxEffects: true },
      });
      return { entry, batchRevision };
    });
    return serviceOk({
      entryId: row.entry.id,
      status: row.entry.status,
      version: row.entry.version,
      batchRevision: row.batchRevision,
    });
  } catch (cause) {
    if (cause instanceof ConsolidationEntryError) return serviceError(cause.message, cause.status);
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
      return serviceError("抵销分录编号重复，或基础分录已经存在后续修订/冲销", 409);
    }
    throw cause;
  }
}

export async function saveConsolidationTaxEffect(rawCommand: SaveConsolidationTaxEffectCommand) {
  const validation = buildSaveConsolidationTaxEffectCommand(
    rawCommand.batchId,
    rawCommand.entryId,
    rawCommand.input,
    rawCommand.userId,
  );
  if (!validation.ok) return serviceError(validation.issue.message, validation.issue.status);
  const command = validation.data;
  try {
    const batch = await loadDraftBatch(command.batchId);
    const entry = await prisma.financeConsolidationEntry.findUnique({ where: { id: command.entryId } });
    if (!entry || entry.batchId !== batch.id) throw new ConsolidationEntryError("抵销分录不属于当前批次", 404);
    if (entry.status !== "draft") throw new ConsolidationEntryError("已提交或批准分录的税务影响不能原地修改", 409);
    if (!batch.entities.some((entity) => entity.id === command.input.entitySnapshotId)) {
      throw new ConsolidationEntryError("税务影响纳税主体不属于当前合并范围快照", 409);
    }
    const direct = await directAction(
      "finance.statements.consolidationTaxEffect.save",
      command.userId,
      "税务影响保存已配置为必须走流程，请从统一保存入口提交",
    );
    if (!direct.ok) return direct;
    const taxEffect = await prisma.$transaction(async (tx) => {
      const batchRevision = await claimConsolidationBatchRevision(tx, {
        batchId: batch.id,
        status: "draft",
        expectedRevision: command.input.expectedRevision,
      });
      if (!batchRevision) {
        throw new ConsolidationEntryError("合并批次已被提交或被其他人修改，请刷新后重试", 409);
      }
      const taxData = {
        entitySnapshotId: command.input.entitySnapshotId,
        effectKey: command.input.effectKey,
        taxEffectType: command.input.taxEffectType,
        differenceAmount: command.input.differenceAmount,
        taxRate: command.input.taxRate,
        recognition: command.input.recognition,
        periodBasis: command.input.periodBasis || "current",
        jurisdiction: command.input.jurisdiction,
        recognitionLocation: command.input.recognitionLocation,
        balanceSheetLineCode: command.input.balanceSheetLineCode,
        counterpartLineCode: command.input.counterpartLineCode,
        reversalPeriod: command.input.reversalPeriod,
        recoverabilityConclusion: command.input.recoverabilityConclusion,
        evidence: command.input.evidence,
      };
      const row = await tx.financeConsolidationTaxEffect.upsert({
        where: { entryId_effectKey: { entryId: entry.id, effectKey: command.input.effectKey } },
        create: { entryId: entry.id, ...taxData, preparedBy: command.userId },
        update: { ...taxData, preparedBy: command.userId },
      });
      return { row, batchRevision };
    });
    return serviceOk({
      taxEffectId: taxEffect.row.id,
      derivedTaxAmount: Math.round(Math.abs(Number(taxEffect.row.differenceAmount) * Number(taxEffect.row.taxRate)) * 100) / 100,
      batchRevision: taxEffect.batchRevision,
    });
  } catch (cause) {
    if (cause instanceof ConsolidationEntryError) return serviceError(cause.message, cause.status);
    throw cause;
  }
}

export async function deleteConsolidationEntry(rawCommand: DeleteConsolidationEntryCommand) {
  const validation = buildDeleteConsolidationEntryCommand(
    rawCommand.batchId,
    rawCommand.entryId,
    rawCommand,
    rawCommand.userId,
  );
  if (!validation.ok) return serviceError(validation.issue.message, validation.issue.status);
  const command = validation.data;
  try {
    const batch = await loadDraftBatch(command.batchId);
    const direct = await directAction(
      "finance.statements.consolidationEntry.delete",
      command.userId,
      "抵销分录删除已配置为必须走流程，请从统一入口提交",
    );
    if (!direct.ok) return direct;
    const actorName = await resolveUserBusinessActorName(command.userId);
    if (!actorName) return serviceError("当前账号缺少员工身份且不是管理员，不能删除抵销分录", 409);
    let deletedBatchRevision: number | null = null;
    const result = await guardedDelete({
      entityType: "FinanceConsolidationEntry",
      modelKey: "financeConsolidationEntry",
      id: command.entryId,
      userId: command.userId,
      actionLabel: "删除抵销分录",
      deleteMode: "hard",
      auditPolicy: "event",
      skipVersionCheck: true,
      referencePolicy: "checked",
      references: [{
        label: "后续修订或冲销分录",
        count: (tx) => tx.financeConsolidationEntry.count({
          where: {
            OR: [
              { supersedesEntryId: command.entryId },
              { predecessorEntryId: command.entryId },
              { reversalOfEntryId: command.entryId },
            ],
          },
        }),
      }],
      onBeforeDelete: async (_id, context) => {
        const entry = await context.tx.financeConsolidationEntry.findUnique({
          where: { id: command.entryId },
          include: {
            lines: { orderBy: { lineNo: "asc" } },
            taxEffects: { orderBy: { effectKey: "asc" } },
            successor: { select: { id: true } },
            revisions: { select: { id: true } },
            reversalEntries: { select: { id: true } },
          },
        });
        if (!entry || entry.batchId !== batch.id) return { error: "抵销分录不属于当前批次", status: 404 };
        if (entry.status !== "draft") return { error: "只有草稿抵销分录可以删除", status: 409 };
        if (entry.successor || entry.revisions.length > 0 || entry.reversalEntries.length > 0) {
          return { error: "抵销分录已被后续版本引用，不能删除", status: 409 };
        }
        const batchRevision = await claimConsolidationBatchRevision(context.tx, {
          batchId: batch.id,
          status: "draft",
          expectedRevision: command.expectedRevision,
        });
        if (!batchRevision) return { error: "合并批次已被提交或被其他人修改，请刷新后重试", status: 409 };
        await appendConsolidationBatchEvent(context.tx, {
          batchId: batch.id,
          eventType: "mutation",
          action: "entry.delete",
          fromStatus: "draft",
          toStatus: "draft",
          note: command.note,
          actorUserId: command.userId,
          actorName,
          batchRevision,
          targetType: "entry",
          targetId: entry.id,
          snapshot: immutableAuditSnapshot(entry),
        });
        deletedBatchRevision = batchRevision;
        return { ok: true };
      },
    });
    if (!result.ok) return serviceError(result.error, result.status ?? 400);
    if (!deletedBatchRevision) throw new ConsolidationEntryError("抵销分录删除未生成审计修订号", 500);
    return serviceOk({ deletedEntryId: command.entryId, batchRevision: deletedBatchRevision });
  } catch (cause) {
    if (cause instanceof ConsolidationEntryError) return serviceError(cause.message, cause.status);
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2003") {
      return serviceError("抵销分录已被其他合并版本引用，不能删除", 409);
    }
    throw cause;
  }
}

export async function deleteConsolidationTaxEffect(rawCommand: DeleteConsolidationTaxEffectCommand) {
  const validation = buildDeleteConsolidationTaxEffectCommand(
    rawCommand.batchId,
    rawCommand.entryId,
    rawCommand.taxEffectId,
    rawCommand,
    rawCommand.userId,
  );
  if (!validation.ok) return serviceError(validation.issue.message, validation.issue.status);
  const command = validation.data;
  try {
    const batch = await loadDraftBatch(command.batchId);
    const direct = await directAction(
      "finance.statements.consolidationTaxEffect.delete",
      command.userId,
      "税务影响删除已配置为必须走流程，请从统一入口提交",
    );
    if (!direct.ok) return direct;
    const actorName = await resolveUserBusinessActorName(command.userId);
    if (!actorName) return serviceError("当前账号缺少员工身份且不是管理员，不能删除税务影响", 409);
    let deletedBatchRevision: number | null = null;
    const result = await guardedDelete({
      entityType: "FinanceConsolidationTaxEffect",
      modelKey: "financeConsolidationTaxEffect",
      id: command.taxEffectId,
      userId: command.userId,
      actionLabel: "删除抵销税务影响",
      deleteMode: "hard",
      auditPolicy: "event",
      skipVersionCheck: true,
      referencePolicy: "none",
      onBeforeDelete: async (_id, context) => {
        const taxEffect = await context.tx.financeConsolidationTaxEffect.findUnique({
          where: { id: command.taxEffectId },
          include: { entry: { select: { id: true, batchId: true, status: true } } },
        });
        if (!taxEffect || taxEffect.entry.id !== command.entryId || taxEffect.entry.batchId !== batch.id) {
          return { error: "税务影响不属于当前抵销分录和批次", status: 404 };
        }
        if (taxEffect.entry.status !== "draft") {
          return { error: "只有草稿抵销分录的税务影响可以删除", status: 409 };
        }
        const batchRevision = await claimConsolidationBatchRevision(context.tx, {
          batchId: batch.id,
          status: "draft",
          expectedRevision: command.expectedRevision,
        });
        if (!batchRevision) return { error: "合并批次已被提交或被其他人修改，请刷新后重试", status: 409 };
        await appendConsolidationBatchEvent(context.tx, {
          batchId: batch.id,
          eventType: "mutation",
          action: "taxEffect.delete",
          fromStatus: "draft",
          toStatus: "draft",
          note: command.note,
          actorUserId: command.userId,
          actorName,
          batchRevision,
          targetType: "taxEffect",
          targetId: taxEffect.id,
          snapshot: immutableAuditSnapshot(taxEffect),
        });
        deletedBatchRevision = batchRevision;
        return { ok: true };
      },
    });
    if (!result.ok) return serviceError(result.error, result.status ?? 400);
    if (!deletedBatchRevision) throw new ConsolidationEntryError("税务影响删除未生成审计修订号", 500);
    return serviceOk({ deletedTaxEffectId: command.taxEffectId, batchRevision: deletedBatchRevision });
  } catch (cause) {
    if (cause instanceof ConsolidationEntryError) return serviceError(cause.message, cause.status);
    throw cause;
  }
}
export async function loadConsolidationBatchWithEntries(batchId: number) {
  const row = await prisma.financeConsolidationBatch.findUnique({
    where: { id: batchId },
    include: CONSOLIDATION_BATCH_INCLUDE,
  });
  return row ? consolidationBatchSnapshot(row) : null;
}
