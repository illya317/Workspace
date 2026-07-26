import type { Prisma } from "@workspace/platform/server/prisma";
import {
  buildTPlusCounterpartyClassificationCommand,
  type TPlusCounterpartyCandidate,
} from "../../domain/counterparty-classification-validation";
import type { NormalizedReadableBatch } from "./types";

function pairKey(candidate: Pick<TPlusCounterpartyCandidate, "memberId" | "accountId">) {
  return `${candidate.memberId}:${candidate.accountId}`;
}

export async function materializeTPlusCounterpartyClassifications(
  tx: Prisma.TransactionClient,
  batch: NormalizedReadableBatch,
  importId: number,
): Promise<number> {
  if (batch.spec.sourceSystem !== "TPLUS" || batch.spec.mappingMode !== "historical") return 0;
  const accountSelect = { id: true, code: true, name: true } as const;
  const memberSelect = { id: true, dimensionType: true } as const;
  const [voucherItems, balances, openItems] = await Promise.all([
    tx.financeVoucherItem.findMany({
      where: { importId },
      select: { account: { select: accountSelect }, auxiliaryLinks: { select: { member: { select: memberSelect } } } },
    }),
    tx.financeAuxiliaryBalance.findMany({
      where: { importId },
      select: { account: { select: accountSelect }, members: { select: { member: { select: memberSelect } } } },
    }),
    tx.financeOpenItem.findMany({
      where: { importId, accountId: { not: null } },
      select: { account: { select: accountSelect }, members: { select: { member: { select: memberSelect } } } },
    }),
  ]);
  const candidates = new Map<string, TPlusCounterpartyCandidate>();
  const add = (account: { id: number; code: string; name: string } | null, members: Array<{ member: { id: number; dimensionType: string } }>) => {
    if (!account) return;
    for (const { member } of members) {
      const candidate = {
        memberId: member.id, accountId: account.id, accountCode: account.code,
        accountName: account.name, rawDimensionType: member.dimensionType,
      };
      candidates.set(pairKey(candidate), candidate);
    }
  };
  for (const item of voucherItems) add(item.account, item.auxiliaryLinks);
  for (const balance of balances) add(balance.account, balance.members);
  for (const openItem of openItems) add(openItem.account, openItem.members);
  if (!candidates.size) return 0;

  const memberIds = [...new Set([...candidates.values()].map((item) => item.memberId))];
  const accountIds = [...new Set([...candidates.values()].map((item) => item.accountId))];
  const existing = await tx.financeCounterpartyClassification.findMany({
    where: { memberId: { in: memberIds }, accountId: { in: accountIds } },
  });
  const existingByPair = new Map(existing.map((item) => [pairKey(item), item]));
  const missing = [...candidates.values()].flatMap((candidate) => {
    const found = existingByPair.get(pairKey(candidate));
    const command = buildTPlusCounterpartyClassificationCommand(candidate, found ?? null);
    if (!command.ok) throw new Error(command.issue.message);
    return command.data.alreadyLocked ? [] : [command.data.classification];
  });
  if (missing.length) await tx.financeCounterpartyClassification.createMany({ data: missing, skipDuplicates: true });
  return missing.length;
}
