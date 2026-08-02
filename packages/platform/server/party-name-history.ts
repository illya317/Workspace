import type { Prisma } from "./prisma";
import { normalizePartyName } from "./party-name-rules";
export {
  normalizePartyName,
  partyNameAt,
  validatePartyNameFacts,
  type PartyNameFact,
  type PartyNameKind,
  type PartyNameRecordStatus,
} from "./party-name-rules";

type PartyNameClient = Pick<Prisma.TransactionClient, "partyNameHistory">;

export async function findPartyIdsByKnownName(name: string, tx: PartyNameClient) {
  const normalizedName = normalizePartyName(name);
  if (!normalizedName) return [];
  const rows = await tx.partyNameHistory.findMany({
    where: { normalizedName, recordStatus: { not: "voided" } },
    select: { partyId: true },
    distinct: ["partyId"],
    orderBy: { partyId: "asc" },
  });
  return rows.map((row) => row.partyId);
}
