import { prisma } from "@workspace/platform/server/prisma";
import type { Prisma } from "@workspace/platform/server/prisma";
import type { FinanceCounterpartyRelatedPartyType } from "../../types/ledger";

export interface CounterpartyIdentityMember {
  id: number;
  linkedCompanyId: number | null;
  linkedEmployeeId: number | null;
  linkedPartyId: number | null;
}

export interface CounterpartyIdentityFact {
  identityMatched: boolean;
  targetKind: "company" | "employee" | "party" | null;
  relatedPartyType: FinanceCounterpartyRelatedPartyType | null;
}

export interface PartyIdentityFacts {
  activeCompany: boolean;
  coreManagementEmployee: boolean;
  ownershipInfluence: boolean;
  manualRelatedPartyType: string | null;
}

const RELATED_PARTY_TYPES = new Set<FinanceCounterpartyRelatedPartyType>([
  "group",
  "joint_venture_associate",
  "investor_influence",
  "key_management_related",
  "other_related",
]);

export async function loadCounterpartyIdentityFacts(
  members: readonly CounterpartyIdentityMember[],
  asOfDate: string,
) {
  const employeeIds = uniqueIds(members.map((member) => member.linkedEmployeeId));
  const partyIds = uniqueIds(members.map((member) => member.linkedPartyId));
  const [coreEmployees, parties, influentialOwnerPartyIds] = await Promise.all([
    employeeIds.length === 0 ? [] : prisma.employee.findMany({
      where: {
        id: { in: employeeIds },
        employments: { some: { isActive: true, personnelType: "核心人员" } },
      },
      select: { id: true },
    }),
    partyIds.length === 0 ? [] : prisma.party.findMany({
      where: { id: { in: partyIds } },
      select: {
        id: true,
        externalProfile: { select: { relatedPartyType: true } },
        company: { select: { isActive: true } },
        employeeIdentityLink: {
          select: {
            recordStatus: true,
            employee: {
              select: {
                employments: {
                  where: { isActive: true, personnelType: "核心人员" },
                  select: { id: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    }),
    loadInfluentialOwnerPartyIds(partyIds, asOfDate),
  ]);
  const coreEmployeeIds = new Set(coreEmployees.map((employee) => employee.id));
  const influentialPartyIds = new Set(influentialOwnerPartyIds);
  const partyFactsById = new Map<number, PartyIdentityFacts>(parties.map((party) => [party.id, {
    activeCompany: party.company?.isActive === true,
    coreManagementEmployee: party.employeeIdentityLink?.recordStatus === "confirmed"
      && Boolean(party.employeeIdentityLink.employee.employments.length),
    ownershipInfluence: influentialPartyIds.has(party.id),
    manualRelatedPartyType: party.externalProfile?.relatedPartyType ?? null,
  }]));

  return new Map(members.map((member) => [
    member.id,
    resolveCounterpartyIdentityFact(member, coreEmployeeIds, partyFactsById.get(member.linkedPartyId ?? -1)),
  ]));
}

export function resolveCounterpartyIdentityFact(
  member: CounterpartyIdentityMember,
  coreEmployeeIds: ReadonlySet<number>,
  partyFacts: PartyIdentityFacts | undefined,
): CounterpartyIdentityFact {
  if (member.linkedCompanyId !== null) {
    return { identityMatched: true, targetKind: "company", relatedPartyType: "group" };
  }
  if (member.linkedEmployeeId !== null) {
    return {
      identityMatched: true,
      targetKind: "employee",
      relatedPartyType: coreEmployeeIds.has(member.linkedEmployeeId) ? "key_management_related" : null,
    };
  }
  if (member.linkedPartyId !== null) {
    return {
      identityMatched: true,
      targetKind: "party",
      relatedPartyType: resolvePartyRelatedPartyType(partyFacts),
    };
  }
  return { identityMatched: false, targetKind: null, relatedPartyType: null };
}

function resolvePartyRelatedPartyType(
  facts: PartyIdentityFacts | undefined,
): FinanceCounterpartyRelatedPartyType | null {
  if (!facts) return null;
  if (facts.activeCompany) return "group";
  if (facts.ownershipInfluence) return "investor_influence";
  if (facts.coreManagementEmployee) return "key_management_related";
  return normalizeRelatedPartyType(facts.manualRelatedPartyType);
}

async function loadInfluentialOwnerPartyIds(partyIds: number[], asOfDate: string) {
  if (partyIds.length === 0) return [];
  const start = new Date(`${asOfDate}T00:00:00.000Z`);
  const end = new Date(`${asOfDate}T23:59:59.999Z`);
  const activeAtDate = ownershipDateWhere(start, end);
  const rows = await prisma.ownershipInterest.findMany({
    where: {
      ownerPartyId: { in: partyIds },
      ...activeAtDate,
      OR: [
        { issuer: { isActive: true } },
        {
          issuer: {
            party: {
              ownedInterests: {
                some: {
                  ...activeAtDate,
                  issuer: { isActive: true },
                },
              },
            },
          },
        },
      ],
    },
    select: { ownerPartyId: true },
    distinct: ["ownerPartyId"],
  });
  return rows.map((row) => row.ownerPartyId);
}

function ownershipDateWhere(start: Date, end: Date): Prisma.OwnershipInterestWhereInput {
  return {
    recordStatus: "confirmed",
    AND: [
      { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: end } }] },
      { OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }] },
    ],
  };
}

function normalizeRelatedPartyType(value: string | null) {
  return value && RELATED_PARTY_TYPES.has(value as FinanceCounterpartyRelatedPartyType)
    ? value as FinanceCounterpartyRelatedPartyType
    : null;
}

function uniqueIds(values: Array<number | null>) {
  return [...new Set(values.filter((value): value is number => value !== null))];
}
