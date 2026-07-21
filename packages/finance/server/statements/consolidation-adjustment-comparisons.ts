import type {
  ConsolidationVoucherMatchFact,
  ConsolidationVoucherMatchGroup,
} from "../domain/consolidation-entry-generation";
import type {
  ConsolidationAdjustmentComparison,
  ConsolidationAdjustmentVoucherSource,
} from "@workspace/finance/types";
import type { ConsolidationBatchRow } from "./consolidation-dto";
import { loadConsolidationVoucherMatchGroups } from "./consolidation-voucher-matches";

interface ComparisonEntity {
  companyId: number;
  code: string;
  name: string;
  role: "parent" | "subsidiary";
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function accountLabel(facts: readonly ConsolidationVoucherMatchFact[]) {
  return [...new Map(facts.map((fact) => [
    fact.accountCode,
    `${fact.accountCode} ${fact.accountName}`,
  ])).values()].join("、") || "—";
}

function direction(value: number): "借" | "贷" | "—" {
  return value > 0.004 ? "借" : value < -0.004 ? "贷" : "—";
}

function sourceSnapshot(fact: ConsolidationVoucherMatchFact): ConsolidationAdjustmentVoucherSource {
  return {
    voucherItemId: fact.itemId,
    voucherNo: fact.voucherNo,
    voucherDate: fact.voucherDate,
    accountCode: fact.accountCode,
    accountName: fact.accountName,
    description: fact.description,
    direction: fact.signedAmount >= 0 ? "借" : "贷",
    amount: money(Math.abs(fact.signedAmount)),
    currencyCode: fact.currencyCode,
  };
}

function comparisonStatus(group: ConsolidationVoucherMatchGroup): ConsolidationAdjustmentComparison["status"] {
  if (group.status === "matched") return "equal";
  if (group.status === "difference") return "difference";
  if (group.leftFacts.length === 0 || group.rightFacts.length === 0) return "missingCounterpart";
  return "unresolved";
}

export function buildConsolidationAdjustmentComparisons(
  entities: readonly ComparisonEntity[],
  groups: readonly ConsolidationVoucherMatchGroup[],
): ConsolidationAdjustmentComparison[] {
  const entityById = new Map(entities.map((entity) => [entity.companyId, entity]));
  return groups.map((group) => {
    const left = entityById.get(group.leftCompanyId);
    const right = group.rightCompanyId ? entityById.get(group.rightCompanyId) : null;
    const leftDirection = direction(group.leftNetAmount);
    const rightDirection = direction(group.rightNetAmount);
    const matchedSummary = leftDirection === "借" && rightDirection === "贷"
      ? `借：${accountLabel(group.rightFacts)}；贷：${accountLabel(group.leftFacts)}`
      : leftDirection === "贷" && rightDirection === "借"
        ? `借：${accountLabel(group.leftFacts)}；贷：${accountLabel(group.rightFacts)}`
        : "双方凭证明细方向不能形成抵销分录";
    return {
      key: group.generationKey,
      category: group.category === "investmentEquity" ? "investment" as const : "intercompany" as const,
      title: `${left?.code ?? group.leftCompanyId} ↔ ${right?.code ?? "待确认"} ${group.category === "investmentEquity" ? "投资款" : "往来款"}`,
      entrySummary: group.status === "matched" ? matchedSummary : group.differenceResolution ?? matchedSummary,
      leftCompany: left ? `${left.code} ${left.name}` : String(group.leftCompanyId),
      leftAccount: accountLabel(group.leftFacts),
      leftDirection,
      leftAmount: money(Math.abs(group.leftNetAmount)),
      leftSources: group.leftFacts.map(sourceSnapshot),
      rightCompany: right ? `${right.code} ${right.name}` : "待确认对方公司",
      rightAccount: accountLabel(group.rightFacts),
      rightDirection,
      rightAmount: money(Math.abs(group.rightNetAmount)),
      rightSources: group.rightFacts.map(sourceSnapshot),
      difference: group.differenceAmount,
      status: comparisonStatus(group),
      matchingRule: group.matchingRule,
    };
  });
}

export async function loadConsolidationAdjustmentComparisons(input: {
  batch: ConsolidationBatchRow | null;
  entities: ComparisonEntity[];
}) {
  if (!input.batch) return [];
  return buildConsolidationAdjustmentComparisons(
    input.entities,
    await loadConsolidationVoucherMatchGroups(input.batch),
  );
}
