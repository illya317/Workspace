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
import { prisma } from "@workspace/platform/server/prisma";

interface ComparisonEntity {
  companyId: number;
  code: string;
  name: string;
  role: "parent" | "subsidiary";
}

interface PersistedMatchReview {
  generationKey: string;
  status: string;
  entryId: number | null;
  entry: { id: number; status: string } | null;
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
    sourceKind: "voucher",
    voucherNo: fact.voucherNo,
    voucherDate: fact.voucherDate,
    accountCode: fact.accountCode,
    accountName: fact.accountName,
    description: fact.description,
    direction: fact.signedAmount >= 0 ? "借" : "贷",
    amount: money(Math.abs(fact.signedAmount)),
    currencyCode: fact.currencyCode,
    ...(fact.consolidationAmount === undefined ? {} : {
      consolidationAmountCny: money(Math.abs(fact.consolidationAmount)),
    }),
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
  persistedReviews: readonly PersistedMatchReview[] = [],
  displayYear?: number,
): ConsolidationAdjustmentComparison[] {
  const entityById = new Map(entities.map((entity) => [entity.companyId, entity]));
  const persistedByKey = new Map(persistedReviews.map((review) => [review.generationKey, review]));
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
    const persisted = persistedByKey.get(group.generationKey);
    const oneSidedSummary = group.leftFacts.length === 0 && group.rightFacts.length > 0
      ? `仅发现 ${right?.name ?? "账面二"} 方凭证，${left?.name ?? "账面一"} 方无对应凭证；作为例外保留，不阻断生成`
      : group.rightFacts.length === 0 && group.leftFacts.length > 0
        ? `仅发现 ${left?.name ?? "账面一"} 方凭证，${right?.name ?? "账面二"} 方无对应凭证；作为例外保留，不阻断生成`
        : null;
    const reviewStatus = group.status !== "matched"
      ? "exception" as const
      : persisted?.status === "accepted" && persisted.entry?.status === "approved"
        ? "approved" as const
        : persisted?.status === "rejected"
          ? "returned" as const
          : "pending" as const;
    const visibleLeftFacts = displayYear === undefined
      ? group.leftFacts
      : group.leftFacts.filter((fact) => fact.voucherDate.startsWith(`${displayYear}-`));
    const visibleRightFacts = displayYear === undefined
      ? group.rightFacts
      : group.rightFacts.filter((fact) => fact.voucherDate.startsWith(`${displayYear}-`));
    return {
      key: group.generationKey,
      entryId: persisted?.entryId ?? null,
      category: group.category === "investmentEquity" ? "investment" as const : "intercompany" as const,
      title: `${left?.name ?? "待确认公司"} → ${right?.name ?? "待确认公司"} ${group.category === "investmentEquity" ? "投资款" : "往来款"}`,
      entrySummary: group.status === "matched" ? matchedSummary : oneSidedSummary ?? group.differenceResolution ?? matchedSummary,
      leftCompany: left?.name ?? "待确认公司",
      leftAccount: accountLabel(group.leftFacts),
      leftDirection,
      leftAmount: money(Math.abs(group.leftNetAmount)),
      leftSources: visibleLeftFacts.map(sourceSnapshot),
      leftHistoricalSourceCount: group.leftFacts.length - visibleLeftFacts.length,
      rightCompany: right?.name ?? "待确认对方公司",
      rightAccount: accountLabel(group.rightFacts),
      rightDirection,
      rightAmount: money(Math.abs(group.rightNetAmount)),
      rightSources: visibleRightFacts.map(sourceSnapshot),
      rightHistoricalSourceCount: group.rightFacts.length - visibleRightFacts.length,
      displayPeriodLabel: displayYear === undefined ? "全部期间" : `${displayYear}年`,
      sourceDisplayNote: displayYear === undefined
        ? "勾稽计算覆盖成立以来截至本期的全部凭证；来源按时间顺序并排，不代表逐笔对应。"
        : `勾稽计算覆盖成立以来截至本期的全部凭证；下表仅显示${displayYear}年凭证，来源按时间顺序并排，不代表逐笔对应。`,
      difference: group.differenceAmount,
      status: comparisonStatus(group),
      reviewStatus,
      matchingRule: group.matchingRule,
    };
  });
}

async function loadOpeningCapitalExceptions(
  batch: ConsolidationBatchRow,
  entities: readonly ComparisonEntity[],
): Promise<ConsolidationAdjustmentComparison[]> {
  const foreignEntities = batch.entities.filter((entity) => entity.isConsolidated
    && entity.functionalCurrency?.toUpperCase() !== "CNY");
  if (foreignEntities.length === 0) return [];
  const rows = await prisma.financeAccountBalance.findMany({
    where: {
      companyCode: { in: foreignEntities.map((entity) => entity.companyCode) },
      OR: [
        { period: { year: { lt: batch.year } } },
        { period: { year: batch.year, month: { lte: batch.month } } },
      ],
      account: { OR: [
        { code: { startsWith: "3001" } },
        { name: { contains: "实收资本" } }, { name: { contains: "股本" } },
      ] },
    },
    include: {
      period: { select: { year: true, month: true } },
      account: { select: { id: true, code: true, name: true } },
    },
    orderBy: [{ period: { year: "asc" } }, { period: { month: "asc" } }, { id: "asc" }],
  });
  const firstByCompany = new Map<string, typeof rows[number]>();
  for (const row of rows) {
    if (!firstByCompany.has(row.companyCode)) firstByCompany.set(row.companyCode, row);
  }
  const entityByCompanyId = new Map(entities.map((entity) => [entity.companyId, entity]));
  const snapshotByCode = new Map(foreignEntities.map((entity) => [entity.companyCode, entity]));
  return [...firstByCompany.values()].flatMap((row): ConsolidationAdjustmentComparison[] => {
    const signedOpening = money(row.openingDebit - row.openingCredit);
    if (Math.abs(signedOpening) < 0.005) return [];
    const snapshot = snapshotByCode.get(row.companyCode);
    if (!snapshot) return [];
    const company = entityByCompanyId.get(snapshot.companyId);
    const investor = snapshot.directParentCompanyId
      ? entityByCompanyId.get(snapshot.directParentCompanyId) : null;
    const currencyCode = snapshot.functionalCurrency?.toUpperCase() || "CNY";
    const period = `${row.period.year}-${String(row.period.month).padStart(2, "0")}`;
    const amount = money(Math.abs(signedOpening));
    return [{
      key: `investmentEquity:opening-capital:${snapshot.companyId}:${row.account.code}`,
      entryId: null,
      category: "investment",
      title: `${investor?.name ?? "待确认投资方"} → ${company?.name ?? "待确认公司"} 投资款期初例外`,
      entrySummary: "无对应投资凭证；作为期初权益例外保留，不生成抵销分录",
      leftCompany: investor?.name ?? "待确认投资方",
      leftAccount: "—",
      leftDirection: "—",
      leftAmount: 0,
      leftSources: [],
      leftHistoricalSourceCount: 0,
      rightCompany: company?.name ?? "待确认公司",
      rightAccount: `${row.account.code} ${row.account.name}`,
      rightDirection: signedOpening > 0 ? "借" : "贷",
      rightAmount: amount,
      rightSources: [{
        voucherItemId: null,
        sourceKind: "openingBalance",
        voucherNo: "期初余额",
        voucherDate: period,
        accountCode: row.account.code,
        accountName: row.account.name,
        description: "最早可用账期已存在，未找到对应原始凭证",
        direction: signedOpening > 0 ? "借" : "贷",
        amount,
        currencyCode,
      }],
      rightHistoricalSourceCount: 0,
      displayPeriodLabel: "期初余额",
      sourceDisplayNote: "该事项来自最早可用账期的期初余额，不存在可展开的原始凭证。",
      difference: amount,
      status: "missingCounterpart",
      reviewStatus: "exception",
      matchingRule: "从外币主体最早可用账期的实收资本期初余额识别；没有原始凭证时仅保留例外，不推测投资方金额",
    }];
  });
}

export async function loadConsolidationAdjustmentComparisons(input: {
  batch: ConsolidationBatchRow | null;
  entities: ComparisonEntity[];
}) {
  if (!input.batch) return [];
  return [
    ...buildConsolidationAdjustmentComparisons(
    input.entities,
    await loadConsolidationVoucherMatchGroups(input.batch),
    input.batch.matchGroups,
    input.batch.year,
    ),
    ...await loadOpeningCapitalExceptions(input.batch, input.entities),
  ];
}
