import { serviceError } from "@workspace/platform/server/api";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import type {
  ContractLifecycleTimeline,
  ContractRevisionSummary,
  ContractStateAxis,
  ContractStateEventSummary,
} from "@workspace/administration/types";

export type ContractLegalSnapshot = {
  contractNo: string | null;
  name: string;
  partyA: string | null;
  partyB: string | null;
  shareholder: string | null;
  categoryId: number;
  content: string | null;
  owningCompanyId: number | null;
  ownerDepartmentId: number | null;
  partyAId: number | null;
  partyBId: number | null;
  handlerEmployeeId: number | null;
  signedOn: string | null;
  expiresOn: string | null;
  signedOnPrecision?: string | null;
  expiresOnPrecision?: string | null;
  legacySignDateRaw?: string | null;
  legacyEndDateRaw?: string | null;
  amount: string | null;
  executedAmount: string | null;
  currencyCode: string;
  confidentialityLevel: number;
  location: string | null;
  remark: string | null;
};

export const CONTRACT_LEGAL_SNAPSHOT_SCHEMA_VERSION = 2;

export type ContractMutationResult = {
  version: number;
  currentRevisionId: number | null;
  lifecycleStatus: string;
  signatureStatus: string;
  performanceStatus: string;
};

export function isoContractDate(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}

function nullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalNullableText(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key) ? nullableText(record[key]) : undefined;
}

function nullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableDecimal(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object" && "toString" in value) return String(value);
  return null;
}

function dateValue(value: unknown) {
  if (value instanceof Date) return isoContractDate(value);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return null;
}

export function buildContractLegalSnapshot(record: Record<string, unknown>): ContractLegalSnapshot {
  return {
    contractNo: nullableText(record.contractNo),
    name: String(record.name ?? "").trim(),
    partyA: nullableText(record.partyA),
    partyB: nullableText(record.partyB),
    shareholder: nullableText(record.shareholder),
    categoryId: Number(record.categoryId),
    content: nullableText(record.content),
    owningCompanyId: nullableNumber(record.owningCompanyId),
    ownerDepartmentId: nullableNumber(record.ownerDepartmentId),
    partyAId: nullableNumber(record.partyAId),
    partyBId: nullableNumber(record.partyBId),
    handlerEmployeeId: nullableNumber(record.handlerEmployeeId),
    signedOn: dateValue(record.signedOn),
    expiresOn: dateValue(record.expiresOn),
    signedOnPrecision: optionalNullableText(record, "signedOnPrecision"),
    expiresOnPrecision: optionalNullableText(record, "expiresOnPrecision"),
    legacySignDateRaw: optionalNullableText(record, "legacySignDateRaw"),
    legacyEndDateRaw: optionalNullableText(record, "legacyEndDateRaw"),
    amount: nullableDecimal(record.amount),
    executedAmount: nullableDecimal(record.executedAmount),
    currencyCode: String(record.currencyCode ?? "CNY"),
    confidentialityLevel: Number(record.confidentialityLevel ?? 2),
    location: nullableText(record.location),
    remark: nullableText(record.remark),
  };
}

export function parseContractLegalSnapshot(value: Prisma.JsonValue): ContractLegalSnapshot | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  const snapshot = buildContractLegalSnapshot(value as Record<string, unknown>);
  return snapshot.name && Number.isInteger(snapshot.categoryId) && snapshot.categoryId > 0 ? snapshot : null;
}

export function contractSnapshotProjection(snapshot: ContractLegalSnapshot): Prisma.ContractUncheckedUpdateInput {
  const {
    signedOn,
    expiresOn,
    signedOnPrecision,
    expiresOnPrecision,
    legacySignDateRaw,
    legacyEndDateRaw,
    amount,
    executedAmount,
    ...legalFields
  } = snapshot;
  return {
    ...legalFields,
    signedOn: signedOn ? new Date(`${signedOn}T00:00:00.000Z`) : null,
    expiresOn: expiresOn ? new Date(`${expiresOn}T00:00:00.000Z`) : null,
    ...(signedOnPrecision !== undefined ? { signedOnPrecision } : {}),
    ...(expiresOnPrecision !== undefined ? { expiresOnPrecision } : {}),
    ...(legacySignDateRaw !== undefined ? { legacySignDateRaw } : {}),
    ...(legacyEndDateRaw !== undefined ? { legacyEndDateRaw } : {}),
    amount: amount === null ? null : new Prisma.Decimal(amount),
    executedAmount: executedAmount === null ? null : new Prisma.Decimal(executedAmount),
  };
}

export function mergeContractLegalSnapshot(current: Record<string, unknown>, patch: Prisma.ContractUncheckedUpdateInput) {
  const next = { ...current, ...patch };
  if (Object.prototype.hasOwnProperty.call(patch, "signedOn")) {
    const dateChanged = dateValue(current.signedOn) !== dateValue(patch.signedOn);
    if (dateChanged) {
      next.signedOnPrecision = patch.signedOn ? "day" : null;
      next.legacySignDateRaw = null;
    } else {
      next.signedOnPrecision = current.signedOnPrecision;
      next.legacySignDateRaw = current.legacySignDateRaw;
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "expiresOn")) {
    const dateChanged = dateValue(current.expiresOn) !== dateValue(patch.expiresOn);
    if (dateChanged) {
      next.expiresOnPrecision = patch.expiresOn ? "day" : null;
      next.legacyEndDateRaw = null;
    } else {
      next.expiresOnPrecision = current.expiresOnPrecision;
      next.legacyEndDateRaw = current.legacyEndDateRaw;
    }
  }
  return buildContractLegalSnapshot(next);
}

function revisionSummary(revision: {
  id: number;
  revisionUid: string;
  revisionNo: number;
  recordState: string;
  changeKind: string;
  effectiveOn: Date;
  effectiveThrough: Date | null;
  reason: string | null;
  sourceRevisionId: number | null;
  createdAt: Date;
  confirmedAt: Date | null;
}): ContractRevisionSummary {
  return {
    ...revision,
    recordState: revision.recordState as ContractRevisionSummary["recordState"],
    changeKind: revision.changeKind as ContractRevisionSummary["changeKind"],
    effectiveOn: isoContractDate(revision.effectiveOn)!,
    effectiveThrough: isoContractDate(revision.effectiveThrough),
    createdAt: revision.createdAt.toISOString(),
    confirmedAt: revision.confirmedAt?.toISOString() ?? null,
  };
}

function eventSummary(event: {
  id: number;
  eventUid: string;
  axis: string;
  eventKind: string;
  fromState: string | null;
  toState: string;
  effectiveOn: Date;
  recordState: string;
  reason: string | null;
  reversesEventId: number | null;
  createdAt: Date;
  reversedAt: Date | null;
}): ContractStateEventSummary {
  return {
    ...event,
    axis: event.axis as ContractStateAxis,
    eventKind: event.eventKind as ContractStateEventSummary["eventKind"],
    recordState: event.recordState as ContractStateEventSummary["recordState"],
    effectiveOn: isoContractDate(event.effectiveOn)!,
    createdAt: event.createdAt.toISOString(),
    reversedAt: event.reversedAt?.toISOString() ?? null,
  };
}

export async function contractTimelineWithClient(
  client: Prisma.TransactionClient | typeof prisma,
  contractId: number,
): Promise<ContractLifecycleTimeline> {
  const [contract, revisions, stateEvents] = await Promise.all([
    client.contract.findUnique({ where: { id: contractId }, select: { currentRevisionId: true } }),
    client.contractRevision.findMany({ where: { contractId }, orderBy: [{ revisionNo: "desc" }] }),
    client.contractStateEvent.findMany({ where: { contractId }, orderBy: [{ effectiveOn: "desc" }, { createdAt: "desc" }, { id: "desc" }] }),
  ]);
  const today = workspaceBusinessDate(new Date());
  const summaries = revisions.map(revisionSummary);
  return {
    contractId,
    currentRevision: summaries.find((revision) => revision.id === contract?.currentRevisionId) ?? null,
    upcomingRevisions: summaries.filter((revision) => revision.recordState === "draft" && revision.effectiveOn > today),
    draftRevisions: summaries.filter((revision) => revision.recordState === "draft" && revision.effectiveOn <= today),
    historicalRevisions: summaries.filter((revision) => revision.recordState === "superseded" || revision.recordState === "cancelled"),
    stateEvents: stateEvents.map(eventSummary),
  };
}

export async function lockContractLifecycle(id: number, tx: Prisma.TransactionClient) {
  const rows = await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`
    SELECT "id" FROM "Contract" WHERE "id" = ${id} FOR UPDATE
  `);
  return rows.length > 0;
}

export async function lockContractLifecycleNumber(contractNo: string | null, tx: Prisma.TransactionClient) {
  if (!contractNo) return;
  await tx.$queryRaw<Array<{ locked: string }>>(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtext(${contractNo}))::text AS locked
  `);
}

export async function lifecycleContractNumberConflict(contractNo: string | null, contractId: number, tx: Prisma.TransactionClient) {
  if (!contractNo) return false;
  return Boolean(await tx.contract.findFirst({ where: { contractNo, id: { not: contractId } }, select: { id: true } }));
}

export function contractMutationResult(contract: ContractMutationResult): ContractMutationResult {
  return contract;
}

export function mapContractLifecycleWriteError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return serviceError("合同修订或状态事件冲突，请刷新后重试", 409);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    return serviceError("合同或生命周期记录不存在", 404);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
    return serviceError("合同修订引用的主数据不存在或不可用", 409);
  }
  throw error;
}
