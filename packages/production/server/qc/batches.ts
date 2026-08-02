import "server-only";

import { Prisma, prisma } from "@workspace/platform/server/prisma";
import type { DomainValidationResult } from "@workspace/platform/server/domain-validation";
import { guardedDelete } from "@workspace/platform/server/delete-guard";
import { runSerializableTransaction } from "@workspace/platform/server/serializable-transaction";
import { getUserBusinessActorIdentity } from "@workspace/platform/server/user-identity";
import type { QcBatchCreateInput, QcBatchList, QcBatchSummary } from "./types";
import {
  buildCreateQcBatchCommand,
  buildDeleteQcBatchCommand,
  buildUpdateQcBatchCommand,
  buildUpdateQcBatchPrecheckCommand,
  buildUpdateQcBatchWorkflowCommand,
  type UpdateQcBatchWorkflowCommand,
} from "./domain/qc-validation";
import {
  hashQcPayload,
  QC_BATCH_INCLUDE,
  qcJsonValue,
  signaturePayload,
  toQcBatchSummary,
  type QcBatchRecord,
} from "./batch-record";

interface QcActor {
  actorUserId: number;
  actorName: string;
  actorEmployeeId?: string | null;
  actorEmployeeRefId?: number | null;
}

export class QcBatchMutationError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "QcBatchMutationError";
  }
}

function commandData<T>(result: DomainValidationResult<T>) {
  if (!result.ok) throw new QcBatchMutationError(result.issue.message, result.issue.status ?? 400);
  return result.data;
}

export async function listQcBatches(): Promise<QcBatchList> {
  const records = await prisma.productionQcBatch.findMany({
    include: QC_BATCH_INCLUDE,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const batches = records.map(toQcBatchSummary);
  return {
    batches,
    counts: {
      total: batches.length,
      draft: batches.filter((batch) => batch.status === "draft").length,
      submitted: batches.filter((batch) => batch.status === "submitted").length,
      signatureCount: batches.reduce((sum, batch) => sum + batch.signatures.length, 0),
      fieldValueCount: batches.reduce((sum, batch) => sum + Object.keys(batch.fields).length, 0),
    },
  };
}

export async function createQcBatch(input: QcBatchCreateInput & { actorUserId: number }): Promise<QcBatchSummary> {
  const command = commandData(await buildCreateQcBatchCommand(input));
  const actor = await actorIdentity(input.actorUserId);
  const templateHash = hashQcPayload(command.templateSnapshot);
  return runSerializableTransaction(async (tx) => {
    const record = await tx.productionQcBatch.create({
      data: {
        batchNumber: command.batchNumber,
        productId: command.productId,
        productKey: command.productKey,
        productName: command.productName,
        templateId: command.templateSnapshot.templateId,
        templateVersion: command.templateSnapshot.templateVersion,
        templateSnapshot: qcJsonValue(command.templateSnapshot),
        templateHash,
        createdByUserId: actor.actorUserId,
      },
      include: QC_BATCH_INCLUDE,
    });
    await tx.productionQcAuditEvent.create({
      data: auditBase(record, 1, actor, "created", "create"),
    });
    return toQcBatchSummary(record);
  });
}

export async function getQcBatch(batchId: number): Promise<QcBatchSummary | null> {
  const record = await prisma.productionQcBatch.findUnique({ where: { id: batchId }, include: QC_BATCH_INCLUDE });
  return record ? toQcBatchSummary(record) : null;
}

export async function updateQcBatch(
  batchId: number,
  fields: Record<string, unknown>,
  actorUserId: number,
): Promise<QcBatchSummary | null> {
  const command = commandData(buildUpdateQcBatchCommand(batchId, fields));
  const actor = await actorIdentity(actorUserId);
  return runSerializableTransaction(async (tx) => {
    const record = await findBatch(tx, command.batchId);
    if (!record) return null;
    assertVersion(record.version, command.expectedVersion);
    const nextVersion = record.version + 1;
    await updateVersionedBatch(tx, record.id, record.version, {
      ...(command.batchNumber === undefined ? {} : { batchNumber: command.batchNumber }),
      version: { increment: 1 },
    });
    if (command.batchNumber !== undefined && command.batchNumber !== record.batchNumber) {
      await tx.productionQcAuditEvent.create({
        data: {
          ...auditBase(record, nextVersion, actor, "field_changed", "update_batch"),
          fieldKey: "batchNumber",
          beforeValue: record.batchNumber,
          afterValue: command.batchNumber,
        },
      });
    }
    return toQcBatchSummary(await requiredBatch(tx, record.id));
  });
}

export async function updateQcBatchWorkflow(batchId: number, input: {
  action: "save_inspection" | "approve_review";
  stageKey: string;
  testName: string;
  expectedVersion: number;
  fields?: Record<string, unknown>;
} & QcActor): Promise<QcBatchSummary | null> {
  return mutateWorkflowBatch(batchId, input, (batch) => buildUpdateQcBatchWorkflowCommand(batch, input));
}

export async function updateQcBatchPrecheck(batchId: number, input: {
  action: "save_precheck" | "approve_precheck";
  stageKey: string;
  expectedVersion: number;
  fields?: Record<string, unknown>;
} & QcActor): Promise<QcBatchSummary | null> {
  return mutateWorkflowBatch(batchId, input, (batch) => buildUpdateQcBatchPrecheckCommand(batch, input));
}

export async function deleteQcBatch(input: {
  batchId: number;
  expectedVersion: number;
  actorUserId: number;
}): Promise<boolean> {
  const command = commandData(buildDeleteQcBatchCommand(input.batchId, input.expectedVersion));
  const actor = await actorIdentity(input.actorUserId);
  const result = await guardedDelete({
    entityType: "ProductionQcBatch",
    modelKey: "productionQcBatch",
    id: command.batchId,
    userId: actor.actorUserId,
    expectedVersion: command.expectedVersion,
    deleteMode: "hard",
    referencePolicy: "none",
    auditPolicy: "event",
    lifecyclePolicy: "allow_protected",
    transactionIsolation: "serializable",
    onBeforeDelete: async (_id, context) => {
      const record = await findBatch(context.tx, command.batchId);
      if (!record) return { error: "批次不存在", status: 404 };
      await context.tx.productionQcAuditEvent.create({
        data: {
          ...auditBase(record, record.version, actor, "deleted", "hard_delete"),
          payload: qcJsonValue({ deletedRecord: toQcBatchSummary(record) }),
        },
      });
      return { ok: true };
    },
  });
  if (!result.ok && result.status === 404) return false;
  if (!result.ok) throw new QcBatchMutationError(result.error, result.status ?? 400);
  return true;
}

async function mutateWorkflowBatch(
  batchId: number,
  actor: QcActor & { expectedVersion: number },
  validate: (batch: QcBatchSummary) => Promise<DomainValidationResult<UpdateQcBatchWorkflowCommand>>,
): Promise<QcBatchSummary | null> {
  return runSerializableTransaction(async (tx) => {
    const record = await findBatch(tx, batchId);
    if (!record) return null;
    assertVersion(record.version, actor.expectedVersion);
    const command = commandData(await validate(toQcBatchSummary(record)));
    assertVersion(record.version, command.expectedVersion);
    const nextVersion = record.version + 1;
    const currentFields = toQcBatchSummary(record).fields;
    const mergedFields = { ...currentFields, ...command.fields, [command.signature.fieldKey]: actor.actorName };
    const signedAt = new Date();
    const payload = signaturePayload({
      batch: record,
      fields: mergedFields,
      recordVersion: nextVersion,
      fieldKey: command.signature.fieldKey,
      role: command.signature.role,
      meaning: command.signature.meaning,
      signerUserId: actor.actorUserId,
      signerEmployeeId: actor.actorEmployeeId,
      signerName: actor.actorName,
      signedAt,
    });
    const signedPayloadHash = hashQcPayload(payload);

    await updateVersionedBatch(tx, record.id, record.version, { status: "submitted", version: { increment: 1 } });
    for (const [fieldKey, value] of Object.entries(command.fields)) {
      const metadata = command.fieldMetadata[fieldKey];
      await tx.productionQcFieldValue.upsert({
        where: { batchId_fieldKey: { batchId: record.id, fieldKey } },
        create: {
          batchId: record.id,
          fieldKey,
          value,
          valueType: metadata?.valueType,
          unit: metadata?.unit,
          source: metadata?.source ?? "manual",
          lastRecordVersion: nextVersion,
          updatedByUserId: actor.actorUserId,
        },
        update: {
          value,
          valueType: metadata?.valueType,
          unit: metadata?.unit,
          source: metadata?.source ?? "manual",
          lastRecordVersion: nextVersion,
          updatedByUserId: actor.actorUserId,
        },
      });
      if (currentFields[fieldKey] !== value) {
        await tx.productionQcAuditEvent.create({
          data: {
            ...auditBase(record, nextVersion, actor, "field_changed", "save_record"),
            fieldKey,
            stageKey: command.signature.stageKey,
            testName: command.signature.testName,
            beforeValue: currentFields[fieldKey],
            afterValue: value,
          },
        });
      }
    }
    await tx.productionQcSignature.create({
      data: {
        batchId: record.id,
        ...command.signature,
        signerUserId: actor.actorUserId,
        signerEmployeeId: actor.actorEmployeeId,
        signerEmployeeRefId: actor.actorEmployeeRefId,
        signerName: actor.actorName,
        signedAt,
        signedRecordVersion: nextVersion,
        signedPayloadHash,
        authMethod: "active_session",
      },
    });
    await tx.productionQcAuditEvent.create({
      data: {
        ...auditBase(record, nextVersion, actor, "signed", "apply_signature"),
        fieldKey: command.signature.fieldKey,
        stageKey: command.signature.stageKey,
        testName: command.signature.testName,
        role: command.signature.role,
        signatureMeaning: command.signature.meaning,
        signedPayloadHash,
        payload: qcJsonValue({ authMethod: "active_session", scopeKey: command.signature.scopeKey }),
      },
    });
    return toQcBatchSummary(await requiredBatch(tx, record.id));
  });
}

async function actorIdentity(userId: number): Promise<QcActor> {
  const identity = await getUserBusinessActorIdentity(userId);
  if (!identity) throw new QcBatchMutationError("操作账号未绑定员工档案且不是管理员", 403);
  return {
    actorUserId: userId,
    actorName: identity.signatureName,
    actorEmployeeId: identity.employeeId,
    actorEmployeeRefId: identity.employeeRefId,
  };
}

function auditBase(record: QcBatchRecord, version: number, actor: QcActor, eventType: string, action: string) {
  return {
    batchId: record.id,
    batchRecordUid: record.recordUid,
    batchNumber: record.batchNumber,
    eventType,
    action,
    actorUserId: actor.actorUserId,
    actorEmployeeId: actor.actorEmployeeId,
    actorEmployeeRefId: actor.actorEmployeeRefId,
    actorName: actor.actorName,
    recordVersion: version,
  };
}

function assertVersion(actual: number, expected: number) {
  if (actual !== expected) throw new QcBatchMutationError("批次已被其他人更新，请刷新后重试", 409);
}

async function updateVersionedBatch(
  tx: Prisma.TransactionClient,
  batchId: number,
  version: number,
  data: Prisma.ProductionQcBatchUpdateManyMutationInput,
) {
  const result = await tx.productionQcBatch.updateMany({ where: { id: batchId, version }, data });
  if (result.count !== 1) throw new QcBatchMutationError("批次已被其他人更新，请刷新后重试", 409);
}

function findBatch(tx: Prisma.TransactionClient, batchId: number) {
  return tx.productionQcBatch.findUnique({ where: { id: batchId }, include: QC_BATCH_INCLUDE });
}

async function requiredBatch(tx: Prisma.TransactionClient, batchId: number) {
  const record = await findBatch(tx, batchId);
  if (!record) throw new QcBatchMutationError("批次不存在", 404);
  return record;
}
