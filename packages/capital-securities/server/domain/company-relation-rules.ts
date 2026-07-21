export const INVALID_COMPANY_RELATION_VALUE = Symbol("invalid-company-relation-value");

export interface CompanyRelationRuleState {
  id?: number;
  parentId: number;
  childId: number;
  isConsolidated: boolean;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
}

interface EffectiveRange {
  start: number;
  end: number;
}

export function normalizeCompanyRelationShareRatio(
  value: unknown,
): number | null | typeof INVALID_COMPANY_RELATION_VALUE {
  if (value === null || value === undefined || value === "") return null;
  const ratio = Number(value);
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) return INVALID_COMPANY_RELATION_VALUE;
  return ratio;
}

export function normalizeCompanyRelationDate(
  value: unknown,
): Date | null | typeof INVALID_COMPANY_RELATION_VALUE {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : INVALID_COMPANY_RELATION_VALUE;
  }
  if (typeof value !== "string") return INVALID_COMPANY_RELATION_VALUE;
  const dateText = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return INVALID_COMPANY_RELATION_VALUE;
  const date = new Date(`${dateText}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === dateText
    ? date
    : INVALID_COMPANY_RELATION_VALUE;
}

export function validateCompanyRelationDateRange(effectiveFrom: Date | null, effectiveTo: Date | null) {
  return effectiveFrom && effectiveTo && effectiveTo < effectiveFrom
    ? "失效日期不得早于生效日期"
    : null;
}

export function validateCompanyRelationBusinessRules(
  candidate: CompanyRelationRuleState,
  relations: CompanyRelationRuleState[],
): string | null {
  if (candidate.parentId === candidate.childId) return "持股方和被持股方不能相同";
  const dateIssue = validateCompanyRelationDateRange(candidate.effectiveFrom, candidate.effectiveTo);
  if (dateIssue) return dateIssue;

  const others = relations.filter((relation) => relation.id !== candidate.id);
  if (others.some((relation) => (
    relation.parentId === candidate.parentId
    && relation.childId === candidate.childId
    && rangesOverlap(toEffectiveRange(candidate), toEffectiveRange(relation))
  ))) return "同一持股关系的有效期间不能重叠";
  if (!candidate.isConsolidated) return null;

  const consolidated = others.filter((relation) => relation.isConsolidated);
  if (consolidated.some((relation) => (
    relation.childId === candidate.childId
    && relation.parentId !== candidate.parentId
    && rangesOverlap(toEffectiveRange(candidate), toEffectiveRange(relation))
  ))) return "同一有效期间内，被持股公司只能有一个并表控制方";

  return hasTemporalPath(candidate.childId, candidate.parentId, toEffectiveRange(candidate), consolidated)
    ? "并表控制关系不能形成循环"
    : null;
}

function toEffectiveRange(relation: Pick<CompanyRelationRuleState, "effectiveFrom" | "effectiveTo">): EffectiveRange {
  return {
    start: relation.effectiveFrom?.getTime() ?? Number.NEGATIVE_INFINITY,
    end: relation.effectiveTo?.getTime() ?? Number.POSITIVE_INFINITY,
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
  relations: CompanyRelationRuleState[],
) {
  const outgoing = new Map<number, CompanyRelationRuleState[]>();
  for (const relation of relations) {
    const edges = outgoing.get(relation.parentId) ?? [];
    edges.push(relation);
    outgoing.set(relation.parentId, edges);
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
    for (const relation of outgoing.get(current.companyId) ?? []) {
      const overlap = intersectRanges(current.range, toEffectiveRange(relation));
      if (overlap) queue.push({ companyId: relation.childId, range: overlap });
    }
  }
  return false;
}
