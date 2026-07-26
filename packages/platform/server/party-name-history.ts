import type { Prisma } from "./prisma";

export type PartyNameKind = "legal" | "short" | "trade" | "source_alias";
export type PartyNameRecordStatus = "confirmed" | "pending" | "voided";

export type PartyNameFact = {
  id: number;
  nameKind: PartyNameKind;
  name: string;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  recordStatus: PartyNameRecordStatus;
};

type PartyNameClient = Pick<Prisma.TransactionClient, "partyNameHistory">;

export function normalizePartyName(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, "").trim().toLocaleLowerCase("zh-CN");
}

export function partyNameAt(
  facts: readonly PartyNameFact[],
  kind: PartyNameKind,
  asOf: Date,
) {
  return facts
    .filter((fact) => fact.nameKind === kind && fact.recordStatus === "confirmed")
    .filter((fact) => (fact.effectiveFrom === null || fact.effectiveFrom <= asOf)
      && (fact.effectiveTo === null || fact.effectiveTo >= asOf))
    .sort((left, right) => compareDateDesc(left.effectiveFrom, right.effectiveFrom) || right.id - left.id)[0]
    ?? null;
}

export function validatePartyNameFacts(facts: readonly PartyNameFact[]) {
  for (const fact of facts) {
    if (!fact.name.trim()) throw new Error("主体名称不能为空");
    if (fact.effectiveFrom && fact.effectiveTo && fact.effectiveFrom > fact.effectiveTo) {
      throw new Error(`主体名称有效期倒置：${fact.name}`);
    }
  }
  const legal = facts
    .filter((fact) => fact.nameKind === "legal" && fact.recordStatus === "confirmed")
    .sort((left, right) => compareDateAsc(left.effectiveFrom, right.effectiveFrom) || left.id - right.id);
  for (let index = 1; index < legal.length; index += 1) {
    const previous = legal[index - 1];
    const current = legal[index];
    if (!previous || !current) continue;
    if (previous.effectiveTo === null || current.effectiveFrom === null || previous.effectiveTo >= current.effectiveFrom) {
      throw new Error(`法定名称有效期重叠：${previous.name} / ${current.name}`);
    }
  }
}

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

function compareDateAsc(left: Date | null, right: Date | null) {
  if (left === null || right === null) return left === right ? 0 : left === null ? -1 : 1;
  return left.getTime() - right.getTime();
}

function compareDateDesc(left: Date | null, right: Date | null) {
  return -compareDateAsc(left, right);
}
