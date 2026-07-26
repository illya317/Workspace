export const INVALID_OWNERSHIP_INTEREST_VALUE = Symbol("invalid-ownership-interest-value");

export interface OwnershipInterestRuleState {
  id?: number;
  ownerPartyId: number;
  ownerCompanyId: number | null;
  issuerCompanyId: number;
  isConsolidated: boolean;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  recordStatus?: "confirmed" | "pending";
}

interface EffectiveRange {
  start: number;
  end: number;
}

export function normalizeOwnershipShareRatio(
  value: unknown,
): number | null | typeof INVALID_OWNERSHIP_INTEREST_VALUE {
  if (value === null || value === undefined || value === "") return null;
  const ratio = Number(value);
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) return INVALID_OWNERSHIP_INTEREST_VALUE;
  return ratio;
}

export function normalizeOwnershipDate(
  value: unknown,
): Date | null | typeof INVALID_OWNERSHIP_INTEREST_VALUE {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : INVALID_OWNERSHIP_INTEREST_VALUE;
  }
  if (typeof value !== "string") return INVALID_OWNERSHIP_INTEREST_VALUE;
  const dateText = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return INVALID_OWNERSHIP_INTEREST_VALUE;
  const date = new Date(`${dateText}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === dateText
    ? date
    : INVALID_OWNERSHIP_INTEREST_VALUE;
}

export function validateOwnershipDateRange(effectiveFrom: Date | null, effectiveTo: Date | null) {
  return effectiveFrom && effectiveTo && effectiveTo < effectiveFrom
    ? "失效日期不得早于生效日期"
    : null;
}

export function validateOwnershipInterestBusinessRules(
  candidate: OwnershipInterestRuleState,
  interests: OwnershipInterestRuleState[],
): string | null {
  const dateIssue = validateOwnershipDateRange(candidate.effectiveFrom, candidate.effectiveTo);
  if (dateIssue) return dateIssue;
  if (candidate.isConsolidated && candidate.ownerCompanyId === null) return "只有内部公司股东可以纳入并表";
  if (candidate.recordStatus === "pending") return null;

  const others = interests.filter((interest) => (
    interest.id !== candidate.id && interest.recordStatus !== "pending"
  ));
  if (others.some((interest) => (
    interest.ownerPartyId === candidate.ownerPartyId
    && interest.issuerCompanyId === candidate.issuerCompanyId
    && rangesOverlap(toEffectiveRange(candidate), toEffectiveRange(interest))
  ))) return "同一持股关系的有效期间不能重叠";
  if (!candidate.isConsolidated) return null;

  const consolidated = others.filter((interest) => interest.isConsolidated && interest.ownerCompanyId !== null);
  if (consolidated.some((interest) => (
    interest.issuerCompanyId === candidate.issuerCompanyId
    && interest.ownerPartyId !== candidate.ownerPartyId
    && rangesOverlap(toEffectiveRange(candidate), toEffectiveRange(interest))
  ))) return "同一有效期间内，被持股公司只能有一个并表控制方";

  return hasTemporalPath(
    candidate.issuerCompanyId,
    candidate.ownerCompanyId as number,
    toEffectiveRange(candidate),
    consolidated,
  ) ? "并表控制关系不能形成循环" : null;
}

function toEffectiveRange(interest: Pick<OwnershipInterestRuleState, "effectiveFrom" | "effectiveTo">): EffectiveRange {
  return {
    start: interest.effectiveFrom?.getTime() ?? Number.NEGATIVE_INFINITY,
    end: interest.effectiveTo?.getTime() ?? Number.POSITIVE_INFINITY,
  };
}

function rangesOverlap(left: EffectiveRange, right: EffectiveRange) {
  return left.start <= right.end && right.start <= left.end;
}

function intersectRanges(left: EffectiveRange, right: EffectiveRange): EffectiveRange | null {
  const range = { start: Math.max(left.start, right.start), end: Math.min(left.end, right.end) };
  return range.start <= range.end ? range : null;
}

function rangeContains(outer: EffectiveRange, inner: EffectiveRange) {
  return outer.start <= inner.start && outer.end >= inner.end;
}

function hasTemporalPath(
  fromCompanyId: number,
  targetCompanyId: number,
  candidateRange: EffectiveRange,
  interests: OwnershipInterestRuleState[],
) {
  const outgoing = new Map<number, OwnershipInterestRuleState[]>();
  for (const interest of interests) {
    if (interest.ownerCompanyId === null) continue;
    const edges = outgoing.get(interest.ownerCompanyId) ?? [];
    edges.push(interest);
    outgoing.set(interest.ownerCompanyId, edges);
  }
  const queue: Array<{ companyId: number; range: EffectiveRange }> = [{ companyId: fromCompanyId, range: candidateRange }];
  const visitedRanges = new Map<number, EffectiveRange[]>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (current.companyId === targetCompanyId) return true;
    const knownRanges = visitedRanges.get(current.companyId) ?? [];
    if (knownRanges.some((known) => rangeContains(known, current.range))) continue;
    visitedRanges.set(current.companyId, [
      ...knownRanges.filter((known) => !rangeContains(current.range, known)),
      current.range,
    ]);
    for (const interest of outgoing.get(current.companyId) ?? []) {
      const overlap = intersectRanges(current.range, toEffectiveRange(interest));
      if (overlap) queue.push({ companyId: interest.issuerCompanyId, range: overlap });
    }
  }
  return false;
}
