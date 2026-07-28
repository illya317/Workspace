import type { Prisma } from "@workspace/platform/server/prisma";
import type {
  ExternalPartyCategory,
  ExternalRelatedParty,
  ExternalRelatedPartyCandidate,
} from "@workspace/external/types";
import { resolveLegalFactAsOf } from "./domain/legal-fact-lifecycle";
import { resolveRelatedPartyProtection } from "./domain/related-party-protection";
import { toLegalFactRevision } from "./external-party-projection";

export type ExternalRelatedPartyWithFacts = Prisma.PartyGetPayload<{
  include: {
    externalProfile: true;
    externalRoles: true;
    legalFactRevisions: true;
    company: true;
    ownedInterests: true;
  };
}>;

const ROLE_ORDER: Record<ExternalPartyCategory, number> = {
  customer: 0,
  supplier: 1,
};

export function projectExternalRelatedParty(
  party: ExternalRelatedPartyWithFacts,
  asOfDate: string,
  systemDefault?: {
    relatedPartyType: ExternalRelatedParty["relatedPartyType"];
    systemConfiguredReason: string;
  },
): ExternalRelatedParty | null {
  const relatedPartyType = systemDefault?.relatedPartyType ?? party.externalProfile?.relatedPartyType;
  if (!relatedPartyType || relatedPartyType === "unrelated") return null;
  const current = resolveLegalFactAsOf(party.legalFactRevisions.map(toLegalFactRevision), asOfDate);
  const roles = party.externalRoles
    .map((role) => role.category as ExternalPartyCategory)
    .filter((role): role is ExternalPartyCategory => role === "customer" || role === "supplier")
    .sort((left, right) => ROLE_ORDER[left] - ROLE_ORDER[right]);
  const protection = systemDefault
    ? { systemConfigured: true, systemConfiguredReason: systemDefault.systemConfiguredReason }
    : resolveRelatedPartyProtection(party, asOfDate);
  return {
    id: party.id,
    targetKind: "party",
    version: party.version,
    subjectType: (current?.subjectType ?? party.subjectType) === "individual" ? "individual" : "organization",
    relatedPartyType: relatedPartyType as ExternalRelatedParty["relatedPartyType"],
    name: current?.name ?? party.name,
    fullName: current?.fullName ?? party.fullName,
    identityNumber: current?.identityNumber ?? party.identityNumber,
    legalRepresentative: current?.legalRepresentative ?? party.legalRepresentative,
    roles,
    ...protection,
    asOfDate,
    createdAt: party.createdAt.toISOString(),
    updatedAt: party.updatedAt.toISOString(),
  };
}

export function projectExternalRelatedPartyCandidate(
  party: ExternalRelatedPartyWithFacts,
  visibleCategories: readonly ExternalPartyCategory[],
  asOfDate: string,
): ExternalRelatedPartyCandidate | null {
  if (party.externalProfile?.relatedPartyType && party.externalProfile.relatedPartyType !== "unrelated") return null;
  if (resolveRelatedPartyProtection(party, asOfDate).systemConfigured) return null;
  const roles = party.externalRoles
    .map((role) => role.category as ExternalPartyCategory)
    .filter((role): role is ExternalPartyCategory => visibleCategories.includes(role))
    .sort((left, right) => ROLE_ORDER[left] - ROLE_ORDER[right]);
  if (roles.length === 0) return null;
  const current = resolveLegalFactAsOf(party.legalFactRevisions.map(toLegalFactRevision), asOfDate);
  return {
    id: party.id,
    version: party.version,
    subjectType: (current?.subjectType ?? party.subjectType) === "individual" ? "individual" : "organization",
    name: current?.name ?? party.name,
    fullName: current?.fullName ?? party.fullName,
    identityNumber: current?.identityNumber ?? party.identityNumber,
    roles,
    asOfDate,
  };
}
