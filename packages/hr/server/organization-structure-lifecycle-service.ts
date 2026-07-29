import { randomUUID } from "node:crypto";

import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { Prisma } from "@workspace/platform/server/prisma";
import { runSerializableTransaction, SerializableTransactionConflictError } from "@workspace/platform/server/serializable-transaction";
import {
  assertInitialOrganizationLifecycleMeta,
  classifyOrganizationVersion,
  liveOrganizationVersions,
  organizationChangeIsNoOp,
  organizationVersionAt,
  planOrganizationEffectiveChange,
  resolveSameDayCorrectionMeta,
  type OrganizationEffectiveVersion,
  type OrganizationLifecycleMeta,
} from "./domain/organization-effective-version-validation";
import {
  organizationStructureChangeRecord,
  organizationStructureRequestFingerprint,
} from "./domain/organization-structure-command";
import { findIdempotentChange } from "./organization-structure-change-ledger";

export {
  OrganizationStructureIdempotencyConflictError,
  recordPositionReportOverrideBatchChange,
} from "./organization-structure-change-ledger";

type TransactionClient = Prisma.TransactionClient;

export type DepartmentStructurePayload = {
  code: string;
  name: string;
  alias: string | null;
  hierarchyKind: string;
  level: number;
  parentId: number | null;
  managerPositionId: number | null;
};

export type PositionStructurePayload = {
  code: string;
  name: string;
  alias: string | null;
  departmentId: number | null;
  reportToPositionId: number | null;
};

export type PositionReportOverridePayload = {
  reportToPositionId: number | null;
  headcount: number | null;
  remark: string | null;
};

export class OrganizationStructureConcurrentUpdateError extends Error {
  constructor() {
    super("组织结构已发生变化，请刷新后重试");
    this.name = "OrganizationStructureConcurrentUpdateError";
  }
}

export async function runOrganizationStructureTransaction<T>(
  operation: (tx: TransactionClient) => Promise<T>,
) {
  try {
    return await runSerializableTransaction(operation);
  } catch (error) {
    if (error instanceof SerializableTransactionConflictError) {
      throw new OrganizationStructureConcurrentUpdateError();
    }
    throw error;
  }
}

export async function createDepartmentWithInitialVersion(
  tx: TransactionClient,
  payload: DepartmentStructurePayload,
  meta: OrganizationLifecycleMeta,
  userId: number,
  requestFingerprintOverride?: string,
) {
  assertInitialOrganizationLifecycleMeta(meta);
  const requestFingerprint = requestFingerprintOverride ?? organizationStructureRequestFingerprint("Department", null, meta, payload);
  const duplicate = await findIdempotentChange(tx, meta.idempotencyKey, requestFingerprint, "Department");
  if (duplicate) return tx.department.findUniqueOrThrow({ where: { id: duplicate.aggregateId } });
  if (meta.expectedSequence !== 0 || meta.kind !== "schedule") throw new OrganizationStructureConcurrentUpdateError();
  const initiallyCurrent = meta.effectiveOn <= workspaceBusinessDate(new Date());
  const department = await tx.department.create({
    data: {
      ...payload,
      isArchived: !initiallyCurrent,
      version: 1,
      editedBy: userId,
      editedAt: new Date(),
    },
  });
  const changeId = randomUUID();
  await tx.organizationStructureChange.create({
    data: organizationStructureChangeRecord({
      id: changeId,
      aggregateType: "Department",
      aggregateId: department.id,
      meta,
      userId,
      manifest: { createdSequences: [1] },
      requestFingerprint,
    }),
  });
  await tx.departmentEffectiveVersion.create({
    data: {
      departmentId: department.id,
      sequence: 1,
      validFrom: meta.effectiveOn,
      validToExclusive: null,
      recordState: "confirmed",
      changeKind: "schedule",
      supersedesId: null,
      sourceChangeId: changeId,
      ...payload,
      createdBy: userId,
    },
  });
  return department;
}

export async function applyDepartmentStructureChange(
  tx: TransactionClient,
  input: { departmentId: number; payload: DepartmentStructurePayload; meta: OrganizationLifecycleMeta; userId: number; requestFingerprint?: string },
) {
  const requestFingerprint = input.requestFingerprint ?? organizationStructureRequestFingerprint("Department", input.departmentId, input.meta, input.payload);
  const duplicate = await findIdempotentChange(tx, input.meta.idempotencyKey, requestFingerprint, "Department", input.departmentId);
  if (duplicate) return tx.department.findUniqueOrThrow({ where: { id: input.departmentId } });
  const anchor = await tx.department.findUnique({ where: { id: input.departmentId } });
  if (!anchor) throw new Error("组织不存在");
  if (anchor.version !== input.meta.expectedSequence) throw new OrganizationStructureConcurrentUpdateError();
  const rows = await tx.departmentEffectiveVersion.findMany({ where: { departmentId: input.departmentId }, orderBy: { sequence: "asc" } });
  const mapped = rows.map((row) => ({
    id: row.id,
    sequence: row.sequence,
    validFrom: row.validFrom,
    validToExclusive: row.validToExclusive,
    recordState: row.recordState,
    supersedesId: row.supersedesId,
    payload: departmentPayload(row),
  }));
  const meta = resolveSameDayCorrectionMeta(mapped, input.meta, "组织资料");
  if (organizationChangeIsNoOp(mapped, meta, input.payload)) return anchor;
  const result = await commitDepartmentPlan(tx, anchor.version, mapped, {
    ...input,
    meta,
  }, requestFingerprint);
  return result;
}

async function commitDepartmentPlan(
  tx: TransactionClient,
  expectedSequence: number,
  rows: OrganizationEffectiveVersion<DepartmentStructurePayload>[],
  input: { departmentId: number; payload: DepartmentStructurePayload; meta: OrganizationLifecycleMeta; userId: number },
  requestFingerprint: string,
) {
  const asOf = workspaceBusinessDate(new Date());
  const plan = planOrganizationEffectiveChange(rows, {
    kind: input.meta.kind,
    effectiveOn: input.meta.effectiveOn,
    asOf,
    reason: input.meta.reason,
    targetVersionId: input.meta.targetVersionId
      ?? (input.meta.kind === "correct" ? organizationVersionAt(rows, input.meta.effectiveOn)?.id ?? null : null),
    payload: input.payload,
  });
  const changeId = randomUUID();
  const sequences = plan.drafts.map((_, index) => expectedSequence + index + 1);
  await tx.organizationStructureChange.create({
    data: organizationStructureChangeRecord({
      id: changeId,
      aggregateType: "Department",
      aggregateId: input.departmentId,
      meta: input.meta,
      userId: input.userId,
      manifest: { targetVersionId: plan.targetVersionId, createdSequences: sequences },
      requestFingerprint,
    }),
  });
  for (const [index, draft] of plan.drafts.entries()) {
    await tx.departmentEffectiveVersion.create({
      data: {
        departmentId: input.departmentId,
        sequence: sequences[index]!,
        validFrom: draft.validFrom,
        validToExclusive: draft.validToExclusive,
        recordState: draft.recordState,
        changeKind: draft.changeKind,
        supersedesId: draft.supersedesId,
        sourceChangeId: changeId,
        ...draft.payload,
        createdBy: input.userId,
      },
    });
  }
  const current = versionPayloadAt(plan.liveAfter, asOf);
  const lastSequence = sequences.at(-1) ?? expectedSequence;
  const updated = await tx.department.updateMany({
    where: { id: input.departmentId, version: expectedSequence },
    data: current
      ? { ...current, isArchived: false, archivedAt: null, version: lastSequence, editedBy: input.userId, editedAt: new Date() }
      : { isArchived: true, archivedAt: new Date(), version: lastSequence, editedBy: input.userId, editedAt: new Date() },
  });
  if (updated.count !== 1) throw new OrganizationStructureConcurrentUpdateError();
  return tx.department.findUniqueOrThrow({ where: { id: input.departmentId } });
}

export async function createPositionWithInitialVersion(
  tx: TransactionClient,
  payload: PositionStructurePayload,
  meta: OrganizationLifecycleMeta,
  userId: number,
  extra: { positionDescriptionId: number | null },
  requestFingerprintOverride?: string,
) {
  assertInitialOrganizationLifecycleMeta(meta);
  const requestFingerprint = requestFingerprintOverride ?? organizationStructureRequestFingerprint("Position", null, meta, { payload, extra });
  const duplicate = await findIdempotentChange(tx, meta.idempotencyKey, requestFingerprint, "Position");
  if (duplicate) return tx.position.findUniqueOrThrow({ where: { id: duplicate.aggregateId } });
  if (meta.expectedSequence !== 0 || meta.kind !== "schedule") throw new OrganizationStructureConcurrentUpdateError();
  const initiallyCurrent = meta.effectiveOn <= workspaceBusinessDate(new Date());
  const position = await tx.position.create({
    data: {
      ...payload,
      positionDescriptionId: extra.positionDescriptionId,
      isArchived: !initiallyCurrent,
      version: 1,
      editedBy: userId,
      editedAt: new Date(),
    },
  });
  const changeId = randomUUID();
  await tx.organizationStructureChange.create({
    data: organizationStructureChangeRecord({
      id: changeId,
      aggregateType: "Position",
      aggregateId: position.id,
      meta,
      userId,
      manifest: { createdSequences: [1] },
      requestFingerprint,
    }),
  });
  await tx.positionEffectiveVersion.create({
    data: {
      positionId: position.id,
      sequence: 1,
      validFrom: meta.effectiveOn,
      validToExclusive: null,
      recordState: "confirmed",
      changeKind: "schedule",
      supersedesId: null,
      sourceChangeId: changeId,
      ...payload,
      createdBy: userId,
    },
  });
  return position;
}

export async function applyPositionStructureChange(
  tx: TransactionClient,
  input: { positionId: number; payload: PositionStructurePayload; meta: OrganizationLifecycleMeta; userId: number; requestFingerprint?: string },
) {
  const requestFingerprint = input.requestFingerprint ?? organizationStructureRequestFingerprint("Position", input.positionId, input.meta, input.payload);
  const duplicate = await findIdempotentChange(tx, input.meta.idempotencyKey, requestFingerprint, "Position", input.positionId);
  if (duplicate) return tx.position.findUniqueOrThrow({ where: { id: input.positionId } });
  const anchor = await tx.position.findUnique({ where: { id: input.positionId } });
  if (!anchor) throw new Error("岗位不存在");
  if (anchor.version !== input.meta.expectedSequence) throw new OrganizationStructureConcurrentUpdateError();
  const rows = await tx.positionEffectiveVersion.findMany({ where: { positionId: input.positionId }, orderBy: { sequence: "asc" } });
  const mapped = rows.map((row) => ({
    id: row.id,
    sequence: row.sequence,
    validFrom: row.validFrom,
    validToExclusive: row.validToExclusive,
    recordState: row.recordState,
    supersedesId: row.supersedesId,
    payload: positionPayload(row),
  }));
  const asOf = workspaceBusinessDate(new Date());
  const meta = resolveSameDayCorrectionMeta(mapped, input.meta, "岗位资料");
  if (organizationChangeIsNoOp(mapped, meta, input.payload)) return anchor;
  const plan = planOrganizationEffectiveChange(mapped, {
    kind: meta.kind,
    effectiveOn: meta.effectiveOn,
    asOf,
    reason: meta.reason,
    targetVersionId: meta.targetVersionId
      ?? (meta.kind === "correct" ? organizationVersionAt(mapped, meta.effectiveOn)?.id ?? null : null),
    payload: input.payload,
  });
  const changeId = randomUUID();
  const sequences = plan.drafts.map((_, index) => anchor.version + index + 1);
  await tx.organizationStructureChange.create({
    data: organizationStructureChangeRecord({
      id: changeId,
      aggregateType: "Position",
      aggregateId: input.positionId,
      meta,
      userId: input.userId,
      manifest: { targetVersionId: plan.targetVersionId, createdSequences: sequences },
      requestFingerprint,
    }),
  });
  for (const [index, draft] of plan.drafts.entries()) {
    await tx.positionEffectiveVersion.create({
      data: {
        positionId: input.positionId,
        sequence: sequences[index]!,
        validFrom: draft.validFrom,
        validToExclusive: draft.validToExclusive,
        recordState: draft.recordState,
        changeKind: draft.changeKind,
        supersedesId: draft.supersedesId,
        sourceChangeId: changeId,
        ...draft.payload,
        createdBy: input.userId,
      },
    });
  }
  const current = versionPayloadAt(plan.liveAfter, asOf);
  const lastSequence = sequences.at(-1) ?? anchor.version;
  const updated = await tx.position.updateMany({
    where: { id: input.positionId, version: anchor.version },
    data: current
      ? { ...current, isArchived: false, archivedAt: null, version: lastSequence, editedBy: input.userId, editedAt: new Date() }
      : { isArchived: true, archivedAt: new Date(), version: lastSequence, editedBy: input.userId, editedAt: new Date() },
  });
  if (updated.count !== 1) throw new OrganizationStructureConcurrentUpdateError();
  return tx.position.findUniqueOrThrow({ where: { id: input.positionId } });
}

export async function createPositionReportOverrideWithInitialVersion(
  tx: TransactionClient,
  input: {
    positionId: number;
    companyId: number;
    departmentId: number;
    payload: PositionReportOverridePayload;
    meta: OrganizationLifecycleMeta;
    userId: number;
  },
) {
  assertInitialOrganizationLifecycleMeta(input.meta);
  const requestFingerprint = organizationStructureRequestFingerprint("PositionReportOverride", null, input.meta, {
    positionId: input.positionId,
    companyId: input.companyId,
    departmentId: input.departmentId,
    payload: input.payload,
  });
  const duplicate = await findIdempotentChange(tx, input.meta.idempotencyKey, requestFingerprint, "PositionReportOverride");
  if (duplicate) return tx.positionReportOverride.findUniqueOrThrow({ where: { id: duplicate.aggregateId } });
  if (input.meta.expectedSequence !== 0 || input.meta.kind !== "schedule") throw new OrganizationStructureConcurrentUpdateError();
  const initiallyCurrent = input.meta.effectiveOn <= workspaceBusinessDate(new Date());
  const anchor = await tx.positionReportOverride.create({
    data: {
      positionId: input.positionId,
      companyId: input.companyId,
      departmentId: input.departmentId,
      ...input.payload,
      isActive: initiallyCurrent,
      version: 1,
      editedBy: input.userId,
      editedAt: new Date(),
    },
  });
  const changeId = randomUUID();
  await tx.organizationStructureChange.create({
    data: organizationStructureChangeRecord({
      id: changeId,
      aggregateType: "PositionReportOverride",
      aggregateId: anchor.id,
      meta: input.meta,
      userId: input.userId,
      manifest: { createdSequences: [1] },
      requestFingerprint,
    }),
  });
  await tx.positionReportOverrideEffectiveVersion.create({
    data: {
      positionReportOverrideId: anchor.id,
      sequence: 1,
      validFrom: input.meta.effectiveOn,
      validToExclusive: null,
      recordState: "confirmed",
      changeKind: "schedule",
      supersedesId: null,
      sourceChangeId: changeId,
      departmentId: input.departmentId,
      ...input.payload,
      createdBy: input.userId,
    },
  });
  return anchor;
}

export async function applyPositionReportOverrideChange(
  tx: TransactionClient,
  input: { overrideId: number; payload: PositionReportOverridePayload; meta: OrganizationLifecycleMeta; userId: number },
) {
  const requestFingerprint = organizationStructureRequestFingerprint("PositionReportOverride", input.overrideId, input.meta, input.payload);
  const duplicate = await findIdempotentChange(tx, input.meta.idempotencyKey, requestFingerprint, "PositionReportOverride", input.overrideId);
  if (duplicate) return tx.positionReportOverride.findUniqueOrThrow({ where: { id: input.overrideId } });
  const anchor = await tx.positionReportOverride.findUnique({ where: { id: input.overrideId } });
  if (!anchor) throw new Error("特殊汇报规则不存在");
  if (anchor.version !== input.meta.expectedSequence) throw new OrganizationStructureConcurrentUpdateError();
  const rows = await tx.positionReportOverrideEffectiveVersion.findMany({ where: { positionReportOverrideId: input.overrideId }, orderBy: { sequence: "asc" } });
  const mapped = rows.map((row) => ({
    id: row.id,
    sequence: row.sequence,
    validFrom: row.validFrom,
    validToExclusive: row.validToExclusive,
    recordState: row.recordState,
    supersedesId: row.supersedesId,
    payload: overridePayload(row),
  }));
  const asOf = workspaceBusinessDate(new Date());
  const meta = resolveSameDayCorrectionMeta(mapped, input.meta, "特殊汇报资料");
  if (organizationChangeIsNoOp(mapped, meta, input.payload)) return anchor;
  const plan = planOrganizationEffectiveChange(mapped, {
    kind: meta.kind,
    effectiveOn: meta.effectiveOn,
    asOf,
    reason: meta.reason,
    targetVersionId: meta.targetVersionId
      ?? (meta.kind === "correct" ? organizationVersionAt(mapped, meta.effectiveOn)?.id ?? null : null),
    payload: input.payload,
  });
  const changeId = randomUUID();
  const sequences = plan.drafts.map((_, index) => anchor.version + index + 1);
  await tx.organizationStructureChange.create({
    data: organizationStructureChangeRecord({
      id: changeId,
      aggregateType: "PositionReportOverride",
      aggregateId: input.overrideId,
      meta,
      userId: input.userId,
      manifest: { targetVersionId: plan.targetVersionId, createdSequences: sequences },
      requestFingerprint,
    }),
  });
  for (const [index, draft] of plan.drafts.entries()) {
    await tx.positionReportOverrideEffectiveVersion.create({
      data: {
        positionReportOverrideId: input.overrideId,
        sequence: sequences[index]!,
        validFrom: draft.validFrom,
        validToExclusive: draft.validToExclusive,
        recordState: draft.recordState,
        changeKind: draft.changeKind,
        supersedesId: draft.supersedesId,
        sourceChangeId: changeId,
        departmentId: anchor.departmentId,
        ...draft.payload,
        createdBy: input.userId,
      },
    });
  }
  const current = versionPayloadAt(plan.liveAfter, asOf);
  const lastSequence = sequences.at(-1) ?? anchor.version;
  const updated = await tx.positionReportOverride.updateMany({
    where: { id: input.overrideId, version: anchor.version },
    data: current
      ? { ...current, isActive: true, version: lastSequence, editedBy: input.userId, editedAt: new Date() }
      : { isActive: false, version: lastSequence, editedBy: input.userId, editedAt: new Date() },
  });
  if (updated.count !== 1) throw new OrganizationStructureConcurrentUpdateError();
  return tx.positionReportOverride.findUniqueOrThrow({ where: { id: input.overrideId } });
}

export function organizationTimeline<TPayload>(
  rows: readonly OrganizationEffectiveVersion<TPayload>[],
  asOf: string,
) {
  const liveIds = new Set(liveOrganizationVersions(rows).map((row) => row.id));
  return [...rows]
    .sort((left, right) => right.sequence - left.sequence)
    .map((row) => ({
      id: row.id,
      sequence: row.sequence,
      validFrom: row.validFrom,
      validToExclusive: row.validToExclusive,
      recordState: row.recordState,
      supersedesId: row.supersedesId,
      isLive: liveIds.has(row.id),
      temporalState: liveIds.has(row.id) ? classifyOrganizationVersion(row, asOf) : "past",
      payload: row.payload,
    }));
}

function versionPayloadAt<TPayload>(
  rows: ReadonlyArray<{ validFrom: string | null; validToExclusive: string | null; recordState: string; payload: TPayload }>,
  asOf: string,
) {
  return rows.find((row) => row.recordState !== "cancelled" && organizationVersionAt([{
    id: 1,
    sequence: 1,
    validFrom: row.validFrom,
    validToExclusive: row.validToExclusive,
    recordState: row.recordState,
    supersedesId: null,
    payload: row.payload,
  }], asOf))?.payload ?? null;
}

function departmentPayload(row: DepartmentStructurePayload) {
  return {
    code: row.code,
    name: row.name,
    alias: row.alias,
    hierarchyKind: row.hierarchyKind,
    level: row.level,
    parentId: row.parentId,
    managerPositionId: row.managerPositionId,
  };
}

function positionPayload(row: PositionStructurePayload) {
  return {
    code: row.code,
    name: row.name,
    alias: row.alias,
    departmentId: row.departmentId,
    reportToPositionId: row.reportToPositionId,
  };
}

function overridePayload(row: PositionReportOverridePayload) {
  return {
    reportToPositionId: row.reportToPositionId,
    headcount: row.headcount,
    remark: row.remark,
  };
}
