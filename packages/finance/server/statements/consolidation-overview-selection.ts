import type { StatementReportType } from "@workspace/finance/types";

interface ConsolidationRelationEdge {
  parentId: number;
  childId: number;
}

interface ConsolidationFactPeriod {
  companyCode: string;
  year: number;
  month: number;
  _count: {
    balances: number;
    vouchers: number;
    cashFlowAllocations: number;
  };
}

interface ConsolidationPeriod {
  year: number;
  month: number;
}

function periodKey(period: ConsolidationPeriod) {
  return `${period.year}-${String(period.month).padStart(2, "0")}`;
}

export function selectDefaultConsolidationParentId(
  relations: readonly ConsolidationRelationEdge[],
) {
  if (relations.length === 0) return null;

  const childrenByParent = new Map<number, number[]>();
  const parentIds = new Set<number>();
  const childIds = new Set<number>();
  for (const relation of relations) {
    parentIds.add(relation.parentId);
    childIds.add(relation.childId);
    const children = childrenByParent.get(relation.parentId) ?? [];
    children.push(relation.childId);
    childrenByParent.set(relation.parentId, children);
  }

  const roots = [...parentIds].filter((parentId) => !childIds.has(parentId));
  const candidates = roots.length > 0 ? roots : [...parentIds];
  const reachableCount = (rootId: number) => {
    const visited = new Set<number>([rootId]);
    const pending = [rootId];
    while (pending.length > 0) {
      const parentId = pending.pop()!;
      for (const childId of childrenByParent.get(parentId) ?? []) {
        if (visited.has(childId)) continue;
        visited.add(childId);
        pending.push(childId);
      }
    }
    return visited.size - 1;
  };

  return candidates
    .map((id) => ({ id, descendants: reachableCount(id) }))
    .sort((left, right) => right.descendants - left.descendants || left.id - right.id)[0]?.id ?? null;
}

export function selectLatestCompleteConsolidationPeriod(input: {
  companyCodes: readonly string[];
  factPeriods: readonly ConsolidationFactPeriod[];
  availablePeriods: readonly ConsolidationPeriod[];
  today: Date;
}) {
  if (input.companyCodes.length === 0) return null;

  const coverage = new Map<string, Set<string>>();
  const addCoverage = (period: ConsolidationPeriod, companyCode: string, reportType: StatementReportType) => {
    const key = periodKey(period);
    const entries = coverage.get(key) ?? new Set<string>();
    entries.add(`${companyCode}:${reportType}`);
    coverage.set(key, entries);
  };
  for (const period of input.factPeriods) {
    if (period._count.balances > 0) addCoverage(period, period.companyCode, "balanceSheet");
    if (period._count.vouchers > 0) addCoverage(period, period.companyCode, "incomeStatement");
    if (period._count.cashFlowAllocations > 0) addCoverage(period, period.companyCode, "cashFlow");
  }
  const expectedCoverage = input.companyCodes.length * 3;
  const currentYear = input.today.getFullYear();
  const currentMonth = input.today.getMonth() + 1;
  return input.availablePeriods.find((period) => (
    (period.year < currentYear || period.year === currentYear && period.month <= currentMonth)
    && coverage.get(periodKey(period))?.size === expectedCoverage
  )) ?? null;
}
