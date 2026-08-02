import type { Prisma } from "@workspace/platform/server/prisma";
import type {
  ExternalParty,
  ExternalPartyCategory,
} from "@workspace/external/types";
import {
  buildExternalPartyRoleAvailabilityTimeline,
  resolveExternalPartyRoleAvailability,
  type ExternalPartyRolePeriodSnapshot,
} from "./domain/external-party-role-lifecycle";
import { buildLegalFactTimeline, resolveLegalFactAsOf, type LegalFactRevisionLike } from "./domain/legal-fact-lifecycle";

export type ExternalPartyWithRoles = Prisma.PartyGetPayload<{
  include: {
    externalProfile: true;
    externalRoles: { include: { availabilityPeriods: true } };
    company: true;
    legalFactRevisions: true;
  };
}>;

const ROLE_ORDER: Record<ExternalPartyCategory, number> = {
  customer: 0,
  supplier: 1,
};

export function projectExternalParty(
  party: ExternalPartyWithRoles,
  category: ExternalPartyCategory,
  visibleCategories: readonly ExternalPartyCategory[],
  asOfDate: string,
): ExternalParty | null {
  const role = party.externalRoles.find((item) => item.category === category);
  if (!role) return null;
  const visible = new Set(visibleCategories);
  const roles = party.externalRoles
    .map((item) => item.category as ExternalPartyCategory)
    .filter((item) => visible.has(item))
    .sort((left, right) => ROLE_ORDER[left] - ROLE_ORDER[right]);
  const revisions = party.legalFactRevisions.map(toLegalFactRevision);
  const current = resolveLegalFactAsOf(revisions, asOfDate);
  const timeline = buildLegalFactTimeline(revisions, asOfDate);
  const availabilityRows = role.availabilityPeriods.map(toAvailabilityPeriod);
  const availabilityTimeline = buildExternalPartyRoleAvailabilityTimeline(availabilityRows, asOfDate);
  const availability = availabilityRows.length
    ? resolveExternalPartyRoleAvailability(availabilityRows, asOfDate)
    : role.isActive ? { id: 0 } : null;
  return {
    id: party.id,
    category,
    roles,
    subjectType: (current?.subjectType ?? party.subjectType) as ExternalParty["subjectType"],
    relatedPartyType: (party.externalProfile?.relatedPartyType ?? "unrelated") as ExternalParty["relatedPartyType"],
    code: role.code,
    name: current?.name ?? party.name,
    fullName: current?.fullName ?? party.fullName,
    classification: role.classification,
    identityNumber: current?.identityNumber ?? party.identityNumber,
    legalRepresentative: current?.legalRepresentative ?? party.legalRepresentative,
    contactPerson: role.contactPerson,
    phone: role.phone,
    email: role.email,
    bankName: role.bankName,
    bankAccount: role.bankAccount,
    address: role.address,
    invoiceTitle: role.invoiceTitle,
    invoiceAddressPhone: role.invoiceAddressPhone,
    settlementTerms: role.settlementTerms,
    creditLimit: role.creditLimit,
    creditDays: role.creditDays,
    taxRate: role.taxRate,
    remark: role.remark,
    isActive: Boolean(availability),
    availabilityVersion: role.availabilityVersion,
    availabilityTimeline: availabilityTimeline.map((item) => ({
      id: item.id,
      sequence: item.sequence,
      validFrom: item.validFrom,
      validThrough: item.validThrough,
      temporalState: item.temporalState,
      recordState: item.displayRecordState,
      commandKind: item.commandKind as ExternalParty["availabilityTimeline"][number]["commandKind"],
      reason: item.reason,
      supersedesId: item.supersedesId,
      authoritative: item.authoritative,
      recordedAt: item.recordedAt || "",
    })),
    asOfDate,
    legalFactRevision: Math.max(0, ...revisions.map((item) => item.revision)),
    legalFactTimeline: timeline.map((item) => ({
      id: item.id,
      revision: item.revision,
      commandKind: item.commandKind,
      effectiveOn: item.effectiveOn,
      validThrough: item.validThrough,
      temporalState: item.temporalState,
      recordState: item.displayRecordState as "confirmed" | "cancelled" | "superseded",
      name: item.name,
      fullName: item.fullName,
      identityNumber: item.identityNumber,
      legalRepresentative: item.legalRepresentative,
      registeredCapital: item.registeredCapital,
      registeredAddress: item.registeredAddress,
      registeredDate: item.registeredDate,
      reason: item.reason,
      sourceLabel: item.sourceLabel ?? null,
      sourceReference: item.sourceReference ?? null,
    })),
    version: party.version,
    createdAt: party.createdAt.toISOString(),
    updatedAt: party.updatedAt.toISOString(),
  };
}

function toAvailabilityPeriod(
  row: ExternalPartyWithRoles["externalRoles"][number]["availabilityPeriods"][number],
): ExternalPartyRolePeriodSnapshot {
  return {
    id: row.id,
    roleId: row.roleId,
    sequence: row.sequence,
    validFrom: row.validFrom,
    validThrough: row.validThrough,
    recordState: row.recordState,
    commandKind: row.commandKind,
    supersedesId: row.supersedesId,
    reason: row.reason,
    recordedAt: row.recordedAt.toISOString(),
  };
}

export function toLegalFactRevision(row: ExternalPartyWithRoles["legalFactRevisions"][number]): LegalFactRevisionLike {
  return {
    id: row.id,
    revision: row.revision,
    commandKind: row.commandKind as LegalFactRevisionLike["commandKind"],
    effectiveOn: row.effectiveOn.toISOString().slice(0, 10),
    recordState: row.recordState as LegalFactRevisionLike["recordState"],
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
