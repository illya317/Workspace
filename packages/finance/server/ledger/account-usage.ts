import type { FinanceGroupAccountUsage } from "../../types/group-account";
import {
  oppositeBalanceSide,
  resolveGroupReclassRule,
  type ResolvableReclassRule,
} from "./reclass-rules/resolution";

export interface GroupAccountUsageRevision {
  groupAccountId: number;
  parentGroupAccountId: number | null;
  balanceDirection: string;
  consolidationRole: string;
}

export interface GroupAccountUsageFlags {
  consolidation: boolean;
  reclassification: boolean;
}

export function buildGroupAccountUsageById(
  revisions: readonly GroupAccountUsageRevision[],
  rules: readonly ResolvableReclassRule[],
) {
  const parentByGroupAccountId = new Map(revisions.map((revision) => [
    revision.groupAccountId,
    revision.parentGroupAccountId,
  ]));

  return new Map(revisions.map((revision) => {
    const rule = resolveGroupReclassRule(
      revision.groupAccountId,
      oppositeBalanceSide(revision.balanceDirection),
      rules,
      parentByGroupAccountId,
    );
    return [revision.groupAccountId, {
      consolidation: revision.consolidationRole !== "none",
      reclassification: rule?.decision === "reclassify",
    } satisfies GroupAccountUsageFlags] as const;
  }));
}

export function matchesFinanceGroupAccountUsage(
  flags: GroupAccountUsageFlags,
  usage: FinanceGroupAccountUsage | undefined,
) {
  return usage === undefined || flags[usage];
}
