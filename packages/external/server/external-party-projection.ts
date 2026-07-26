import type { Prisma } from "@workspace/platform/server/prisma";
import type {
  ExternalParty,
  ExternalPartyCategory,
} from "@workspace/external/types";

export type ExternalPartyWithRoles = Prisma.PartyGetPayload<{
  include: { externalProfile: true; externalRoles: true };
}>;

const ROLE_ORDER: Record<ExternalPartyCategory, number> = {
  customer: 0,
  supplier: 1,
};

export function projectExternalParty(
  party: ExternalPartyWithRoles,
  category: ExternalPartyCategory,
  visibleCategories: readonly ExternalPartyCategory[] = [category],
): ExternalParty | null {
  const role = party.externalRoles.find((item) => item.category === category);
  if (!role) return null;
  const visible = new Set(visibleCategories);
  const roles = party.externalRoles
    .map((item) => item.category as ExternalPartyCategory)
    .filter((item) => visible.has(item))
    .sort((left, right) => ROLE_ORDER[left] - ROLE_ORDER[right]);
  return {
    id: party.id,
    category,
    roles,
    subjectType: party.subjectType as ExternalParty["subjectType"],
    relatedPartyType: (party.externalProfile?.relatedPartyType ?? "unrelated") as ExternalParty["relatedPartyType"],
    code: role.code,
    name: party.name,
    fullName: party.fullName,
    classification: role.classification,
    identityNumber: party.identityNumber,
    legalRepresentative: party.legalRepresentative,
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
    isActive: role.isActive,
    version: party.version,
    createdAt: party.createdAt.toISOString(),
    updatedAt: party.updatedAt.toISOString(),
  };
}
