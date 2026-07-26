import type { Prisma } from "@workspace/platform/server/prisma";
import { materializeAutomaticRuleAdjustments } from "../balance-reclass/automatic";
import { materializeAuxiliaryAdjustments } from "./materialize";

export async function materializeConfirmedReclassAdjustments(
  tx: Prisma.TransactionClient,
  policyVersionId: number,
  sourceGroupAccountIds: readonly number[],
  actorUserId?: number | null,
) {
  const rootSourceGroupAccountIds = sourceGroupAccountIds.length > 0
    ? sourceGroupAccountIds
    : [...new Set((await tx.financeReclassRule.findMany({
      where: {
        policyVersionId,
        enabled: true,
        source: "manual",
        confirmedBy: { not: null },
        confirmedAt: { not: null },
      },
      select: { sourceGroupAccountId: true },
    })).map((rule) => rule.sourceGroupAccountId))];
  const hierarchyRows = rootSourceGroupAccountIds.length === 0
    ? []
    : await tx.financeGroupAccountRevision.findMany({
        where: { policyVersionId, isActive: true },
        select: { groupAccountId: true, parentGroupAccountId: true },
      });
  const effectiveSourceGroupAccountIds = collectGroupAccountSubtreeIds(
    rootSourceGroupAccountIds,
    hierarchyRows,
  );
  const auxiliary = await materializeAuxiliaryAdjustments(
    tx,
    policyVersionId,
    effectiveSourceGroupAccountIds,
    actorUserId,
  );
  const automatic = await materializeAutomaticRuleAdjustments(tx, {
    policyVersionId,
    sourceGroupAccountIds: sourceGroupAccountIds.length > 0 ? effectiveSourceGroupAccountIds : [],
    actorUserId,
  });
  return { auxiliary, automatic };
}

export function collectGroupAccountSubtreeIds(
  rootIds: readonly number[],
  hierarchyRows: readonly { groupAccountId: number; parentGroupAccountId: number | null }[],
) {
  const childrenByParent = new Map<number, number[]>();
  for (const row of hierarchyRows) {
    if (row.parentGroupAccountId === null) continue;
    const children = childrenByParent.get(row.parentGroupAccountId) ?? [];
    children.push(row.groupAccountId);
    childrenByParent.set(row.parentGroupAccountId, children);
  }
  const result = new Set(rootIds);
  const pending = [...result];
  for (let index = 0; index < pending.length; index += 1) {
    const current = pending[index]!;
    for (const child of childrenByParent.get(current) ?? []) {
      if (result.has(child)) continue;
      result.add(child);
      pending.push(child);
    }
  }
  return [...result];
}
