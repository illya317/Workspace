import { Prisma, prisma } from "./prisma";
import { normalizePartyName } from "./party-name-history";

export type PartySubjectType = "organization" | "individual";

export interface PartyIdentityInput {
  subjectType: PartySubjectType;
  name: string;
  fullName?: string | null;
  identityNumber: string;
  legalRepresentative?: string | null;
}

export interface PartyCandidate {
  id: number;
  subjectType: PartySubjectType;
  name: string;
  fullName: string | null;
  identityNumberMasked: string;
}

export interface PartyUsage {
  kind: "external" | "company" | "ownership";
  count: number;
}

type PartyClient = Pick<
  Prisma.TransactionClient,
  "party" | "externalPartyRole" | "company" | "ownershipInterest" | "$queryRaw"
>;

function client(tx?: PartyClient): PartyClient {
  return tx ?? prisma;
}

function normalizeIdentityNumber(value: string) {
  return value.trim().toUpperCase();
}

function normalizeIdentity(input: PartyIdentityInput) {
  return {
    subjectType: input.subjectType,
    name: input.name.trim(),
    fullName: input.fullName?.trim() || null,
    identityNumber: normalizeIdentityNumber(input.identityNumber),
    legalRepresentative: input.legalRepresentative?.trim() || null,
  };
}

export function maskPartyIdentityNumber(value: string, subjectType: PartySubjectType) {
  const visibleTail = subjectType === "individual" ? 4 : 6;
  if (value.length <= visibleTail) return "*".repeat(value.length);
  return `${"*".repeat(Math.min(value.length - visibleTail, 12))}${value.slice(-visibleTail)}`;
}

export async function findPartyCandidates(
  input: { keyword: string; subjectType?: PartySubjectType; limit?: number },
  tx?: PartyClient,
): Promise<PartyCandidate[]> {
  const keyword = input.keyword.trim();
  if (!keyword) return [];
  const rows = await client(tx).party.findMany({
    where: {
      ...(input.subjectType ? { subjectType: input.subjectType } : {}),
      OR: [
        { name: { contains: keyword, mode: "insensitive" } },
        { fullName: { contains: keyword, mode: "insensitive" } },
        { identityNumber: { contains: normalizeIdentityNumber(keyword), mode: "insensitive" } },
        { nameHistory: { some: { normalizedName: { contains: normalizePartyName(keyword) }, recordStatus: { not: "voided" } } } },
      ],
    },
    select: { id: true, subjectType: true, name: true, fullName: true, identityNumber: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: Math.min(Math.max(input.limit ?? 20, 1), 50),
  });
  return rows.map((row) => ({
    id: row.id,
    subjectType: row.subjectType as PartySubjectType,
    name: row.name,
    fullName: row.fullName,
    identityNumberMasked: maskPartyIdentityNumber(row.identityNumber, row.subjectType as PartySubjectType),
  }));
}

export async function resolvePartyIdentity(input: Pick<PartyIdentityInput, "subjectType" | "identityNumber">, tx?: PartyClient) {
  return client(tx).party.findUnique({
    where: {
      subjectType_identityNumber: {
        subjectType: input.subjectType,
        identityNumber: normalizeIdentityNumber(input.identityNumber),
      },
    },
  });
}

export async function lockParty(partyId: number, tx: PartyClient) {
  const rows = await tx.$queryRaw<{ id: number }[]>(
    Prisma.sql`SELECT "id" FROM "Party" WHERE "id" = ${partyId} FOR UPDATE`,
  );
  return rows.length > 0;
}

export async function createParty(
  input: PartyIdentityInput & { editedBy?: number | null },
  tx: PartyClient,
) {
  const identity = normalizeIdentity(input);
  return tx.party.create({
    data: {
      ...identity,
      editedBy: input.editedBy ?? null,
      editedAt: input.editedBy ? new Date() : null,
    },
  });
}

export async function describePartyUsages(partyId: number, tx?: PartyClient): Promise<PartyUsage[]> {
  const db = client(tx);
  const [external, company, ownership] = await Promise.all([
    db.externalPartyRole.count({ where: { partyId } }),
    db.company.count({ where: { partyId } }),
    db.ownershipInterest.count({ where: { ownerPartyId: partyId } }),
  ]);
  const usages: PartyUsage[] = [
    { kind: "external", count: external },
    { kind: "company", count: company },
    { kind: "ownership", count: ownership },
  ];
  return usages.filter((usage) => usage.count > 0);
}
