import { requireBusinessDate, type BusinessDate } from "../contracts/business-temporal";
import {
  buildPartyLegalFactTimeline,
  PartyLegalFactLifecycleError,
  partyLegalFactSnapshotOf,
  planPartyLegalFactCommand,
  resolvePartyLegalFactAsOf,
  type PartyLegalFactLifecycleCommand,
  type PartyLegalFactRevisionLike,
  type PartyLegalFactSnapshot,
} from "../contracts/party-legal-facts";
import { workspaceBusinessDate } from "./business-date";
import {
  businessTemporalIdempotencyMatches,
  businessTemporalRequestFingerprint,
} from "./business-temporal-idempotency";
import { Prisma, prisma } from "./prisma";

export type PartyLegalFactTransaction = Pick<
  Prisma.TransactionClient,
  "party" | "company" | "partyLegalFactRevision" | "$queryRaw"
>;

export interface PartyLegalFactSource {
  sourceRegistryChangeId?: number | null;
  sourceType?: string | null;
  sourceLabel?: string | null;
  sourceReference?: string | null;
}

export interface RecordPartyLegalFactInput extends PartyLegalFactSource {
  partyId: number;
  userId: number;
  asOfDate?: string;
  expectedRevision: number;
  idempotencyKey: string;
  command: PartyLegalFactLifecycleCommand;
}

export async function establishPartyLegalFactInTransaction(input: {
  partyId: number;
  userId?: number | null;
  effectiveOn?: string;
  idempotencyKey: string;
  snapshot: PartyLegalFactSnapshot;
  source?: PartyLegalFactSource;
}, tx: PartyLegalFactTransaction) {
  const requestFingerprint = businessTemporalRequestFingerprint({
    aggregate: "PartyLegalFact",
    commandKind: "establish",
    request: {
      partyId: input.partyId,
      effectiveOn: input.effectiveOn ?? null,
      snapshot: partyLegalFactSnapshotOf(input.snapshot),
      source: input.source ?? null,
    },
  });
  const duplicate = await tx.partyLegalFactRevision.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (duplicate) {
    if (
      duplicate.partyId !== input.partyId
      || !businessTemporalIdempotencyMatches(duplicate.requestFingerprint, requestFingerprint)
    ) throw new PartyLegalFactLifecycleError("幂等键已用于不同的法定事实命令");
    return toDomainRevision(duplicate);
  }
  const existing = await tx.partyLegalFactRevision.findFirst({ where: { partyId: input.partyId }, select: { id: true } });
  if (existing) throw new PartyLegalFactLifecycleError("该主体已经建立法定事实基线");
  const effectiveOn = businessDateToUtc(input.effectiveOn ?? workspaceBusinessDate(new Date()));
  const snapshot = partyLegalFactSnapshotOf(input.snapshot);
  const created = await tx.partyLegalFactRevision.create({
    data: {
      partyId: input.partyId,
      revision: 1,
      commandKind: "establish",
      effectiveOn,
      recordState: "confirmed",
      ...snapshot,
      ...input.source,
      idempotencyKey: input.idempotencyKey.trim(),
      requestFingerprint,
      recordedBy: input.userId ?? null,
    },
  });
  return toDomainRevision(created);
}

export async function recordPartyLegalFactInTransaction(
  input: RecordPartyLegalFactInput,
  tx: PartyLegalFactTransaction,
) {
  const requestFingerprint = businessTemporalRequestFingerprint({
    aggregate: "PartyLegalFact",
    commandKind: "record",
    request: {
      partyId: input.partyId,
      asOfDate: input.asOfDate ?? null,
      expectedRevision: input.expectedRevision,
      command: input.command,
      sourceRegistryChangeId: input.sourceRegistryChangeId ?? null,
      sourceType: input.sourceType ?? null,
      sourceLabel: input.sourceLabel ?? null,
      sourceReference: input.sourceReference ?? null,
    },
  });
  await lockPartyForLegalFact(input.partyId, tx);
  const [party, rows, duplicate] = await Promise.all([
    tx.party.findUnique({ where: { id: input.partyId }, include: { company: true } }),
    tx.partyLegalFactRevision.findMany({ where: { partyId: input.partyId }, orderBy: { revision: "asc" } }),
    tx.partyLegalFactRevision.findUnique({ where: { idempotencyKey: input.idempotencyKey } }),
  ]);
  if (!party) throw new PartyLegalFactLifecycleError("法定主体不存在");
  const timeline = rows.map(toDomainRevision);
  const asOfDate = requireBusinessDate(input.asOfDate ?? workspaceBusinessDate(new Date()));
  if (duplicate && (
    duplicate.partyId !== input.partyId
    || !businessTemporalIdempotencyMatches(duplicate.requestFingerprint, requestFingerprint)
  )) throw new PartyLegalFactLifecycleError("幂等键已用于不同的法定事实命令");
  const plan = planPartyLegalFactCommand({
    timeline,
    command: input.command,
    asOf: asOfDate,
    expectedRevision: input.expectedRevision,
    idempotencyKey: input.idempotencyKey,
  });
  if (plan.kind === "idempotent") {
    return { revision: plan.existing, asOfDate, current: resolvePartyLegalFactAsOf(timeline, asOfDate) };
  }
  const conflictingIdentity = await tx.partyLegalFactRevision.findFirst({
    where: {
      partyId: { not: input.partyId },
      subjectType: plan.snapshot.subjectType,
      identityNumber: plan.snapshot.identityNumber,
      recordState: "confirmed",
    },
    select: { partyId: true },
  });
  if (conflictingIdentity) throw new PartyLegalFactLifecycleError("统一代码或证件号码已属于其他法定主体");
  const created = await tx.partyLegalFactRevision.create({
    data: {
      partyId: input.partyId,
      revision: plan.revision,
      commandKind: plan.commandKind,
      effectiveOn: businessDateToUtc(plan.effectiveOn),
      recordState: plan.recordState,
      supersedesId: plan.supersedesId,
      ...plan.snapshot,
      sourceRegistryChangeId: input.sourceRegistryChangeId ?? null,
      sourceType: input.sourceType ?? null,
      sourceLabel: input.sourceLabel ?? null,
      sourceReference: input.sourceReference ?? null,
      reason: plan.reason,
      idempotencyKey: plan.idempotencyKey,
      requestFingerprint,
      recordedBy: input.userId,
    },
  });
  const createdDomain = toDomainRevision(created);
  const projected = resolvePartyLegalFactAsOf([...timeline, createdDomain], asOfDate);
  if (projected) await projectPartyLegalFactCurrentState(input.partyId, projected, input.userId, tx);
  return { revision: createdDomain, asOfDate, current: projected };
}

export async function recordPartyLegalFact(input: RecordPartyLegalFactInput) {
  return prisma.$transaction(
    (tx) => recordPartyLegalFactInTransaction(input, tx),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function getPartyLegalFactState(input: { partyId: number; asOfDate?: string }) {
  const asOfDate = requireBusinessDate(input.asOfDate ?? workspaceBusinessDate(new Date()));
  const rows = await prisma.partyLegalFactRevision.findMany({
    where: { partyId: input.partyId },
    orderBy: { revision: "asc" },
  });
  return { asOfDate, state: resolvePartyLegalFactAsOf(rows.map(toDomainRevision), asOfDate) };
}

export async function getPartyLegalFactTimeline(input: { partyId: number; asOfDate?: string }) {
  const asOfDate = requireBusinessDate(input.asOfDate ?? workspaceBusinessDate(new Date()));
  const rows = await prisma.partyLegalFactRevision.findMany({
    where: { partyId: input.partyId },
    orderBy: { revision: "asc" },
  });
  return { asOfDate, items: buildPartyLegalFactTimeline(rows.map(toDomainRevision), asOfDate) };
}

export function partyLegalFactSnapshotFromCurrent(input: {
  subjectType: string;
  name: string;
  fullName: string | null;
  identityNumber: string;
  legalRepresentative: string | null;
  company?: {
    registeredCapital: string | null;
    registeredAddress: string | null;
    registeredDate: string | null;
  } | null;
}): PartyLegalFactSnapshot {
  return partyLegalFactSnapshotOf({
    subjectType: input.subjectType === "individual" ? "individual" : "organization",
    name: input.name,
    fullName: input.fullName,
    identityNumber: input.identityNumber,
    legalRepresentative: input.legalRepresentative,
    registeredCapital: input.company?.registeredCapital ?? null,
    registeredAddress: input.company?.registeredAddress ?? null,
    registeredDate: input.company?.registeredDate ?? null,
  });
}

async function projectPartyLegalFactCurrentState(
  partyId: number,
  snapshot: PartyLegalFactSnapshot,
  userId: number,
  tx: PartyLegalFactTransaction,
) {
  await tx.party.update({
    where: { id: partyId },
    data: {
      subjectType: snapshot.subjectType,
      name: snapshot.name,
      fullName: snapshot.fullName,
      identityNumber: snapshot.identityNumber,
      legalRepresentative: snapshot.legalRepresentative,
      editedBy: userId,
      editedAt: new Date(),
      version: { increment: 1 },
    },
  });
  await tx.company.updateMany({
    where: { partyId },
    data: {
      registeredCapital: snapshot.registeredCapital,
      registeredAddress: snapshot.registeredAddress,
      registeredDate: snapshot.registeredDate,
      editedBy: userId,
      editedAt: new Date(),
      version: { increment: 1 },
    },
  });
}

async function lockPartyForLegalFact(partyId: number, tx: PartyLegalFactTransaction) {
  const rows = await tx.$queryRaw<{ id: number }[]>(
    Prisma.sql`SELECT "id" FROM "Party" WHERE "id" = ${partyId} FOR UPDATE`,
  );
  if (rows.length === 0) throw new PartyLegalFactLifecycleError("法定主体不存在");
}

function businessDateToUtc(value: string | BusinessDate) {
  const date = requireBusinessDate(value);
  return new Date(`${date}T00:00:00.000Z`);
}

function toDomainRevision(row: {
  id: number;
  revision: number;
  commandKind: string;
  effectiveOn: Date;
  recordState: string;
  supersedesId: number | null;
  subjectType: string;
  name: string;
  fullName: string | null;
  identityNumber: string;
  legalRepresentative: string | null;
  registeredCapital: string | null;
  registeredAddress: string | null;
  registeredDate: string | null;
  sourceRegistryChangeId: number | null;
  sourceType: string | null;
  sourceLabel: string | null;
  sourceReference: string | null;
  reason: string | null;
  idempotencyKey: string;
  recordedBy: number | null;
  recordedAt: Date;
}): PartyLegalFactRevisionLike {
  return {
    id: row.id,
    revision: row.revision,
    commandKind: row.commandKind as PartyLegalFactRevisionLike["commandKind"],
    effectiveOn: row.effectiveOn.toISOString().slice(0, 10),
    recordState: row.recordState as PartyLegalFactRevisionLike["recordState"],
    supersedesId: row.supersedesId,
    subjectType: row.subjectType === "individual" ? "individual" : "organization",
    name: row.name,
    fullName: row.fullName,
    identityNumber: row.identityNumber,
    legalRepresentative: row.legalRepresentative,
    registeredCapital: row.registeredCapital,
    registeredAddress: row.registeredAddress,
    registeredDate: row.registeredDate,
    sourceRegistryChangeId: row.sourceRegistryChangeId,
    sourceType: row.sourceType,
    sourceLabel: row.sourceLabel,
    sourceReference: row.sourceReference,
    reason: row.reason,
    idempotencyKey: row.idempotencyKey,
    recordedBy: row.recordedBy,
    recordedAt: row.recordedAt.toISOString(),
  };
}

export {
  PartyLegalFactLifecycleError,
  type PartyLegalFactLifecycleCommand,
  type PartyLegalFactRevisionLike,
  type PartyLegalFactSnapshot,
};
