import type {
  ConsolidationMatchRequiredAction,
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

function factsCurrencyCode(facts: readonly ConsolidationVoucherMatchFact[]) {
  const currencies = [...new Set(facts.map((fact) => fact.currencyCode.toUpperCase()))];
  return currencies.length === 1 ? currencies[0]! : null;
}

function treatment(group: ConsolidationVoucherMatchGroup) {
  if (group.status === "matched") return {
    treatmentKind: "eliminate" as const,
    treatmentLabel: "生成抵销分录",
    treatmentDetail: "双方金额已在同一币种口径下核对一致。",
  };
  const actions = new Set<ConsolidationMatchRequiredAction>(group.requiredActions);
  if (actions.has("translateToCny") && actions.has("allocateNonControllingInterest")) return {
    treatmentKind: "translateAndAllocateNonControllingInterest" as const,
    treatmentLabel: "投资日折算并分配少数股东权益",
    treatmentDetail: "先用投资发生日汇率把被投资方权益折合为人民币，再按冻结持股比例区分母公司份额与少数股东权益；不能用投资方总额反推汇率。",
  };
  if (actions.has("translateToCny")) return {
    treatmentKind: "translateToCny" as const,
    treatmentLabel: "补齐汇率后再核对",
    treatmentDetail: "双方原币不可直接相减；需使用有来源和日期的适用汇率折合至人民币。",
  };
  if (actions.has("allocateNonControllingInterest")) return {
    treatmentKind: "allocateNonControllingInterest" as const,
    treatmentLabel: "分配少数股东权益",
    treatmentDetail: "仅抵销母公司对应份额，其余列入少数股东权益，不按 100% 抵销。",
  };
  return {
    treatmentKind: "reconcile" as const,
    treatmentLabel: "补证据并查明差额",
    treatmentDetail: group.differenceResolution ?? "补齐对方凭证、报表项目映射或差额说明后再生成分录。",
  };
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
  };
}

function comparisonStatus(group: ConsolidationVoucherMatchGroup): ConsolidationAdjustmentComparison["status"] {
  if (group.status === "matched") return "equal";
  if (group.status === "difference") return "difference";
  if (group.leftFacts.length === 0 || group.rightFacts.length === 0) return "missingCounterpart";
  return "unresolved";
}

export function selectFirstOpeningCapitalRows<
  T extends {
    companyCode: string;
    openingDebit: number;
    openingCredit: number;
    account: { code: string };
  },
>(rows: readonly T[]): T[] {
  const firstByCompanyAccountCode = new Map<string, T>();
  for (const row of rows) {
    const signedOpening = money(row.openingDebit - row.openingCredit);
    const key = `${row.companyCode}:${row.account.code}`;
    if (Math.abs(signedOpening) >= 0.005 && !firstByCompanyAccountCode.has(key)) {
      firstByCompanyAccountCode.set(key, row);
    }
  }
  return [...firstByCompanyAccountCode.values()];
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
      ? `仅发现 ${right?.name ?? "账面二"} 方凭证，${left?.name ?? "账面一"} 方无对应凭证；补齐来源前不生成分录`
      : group.rightFacts.length === 0 && group.leftFacts.length > 0
        ? `仅发现 ${left?.name ?? "账面一"} 方凭证，${right?.name ?? "账面二"} 方无对应凭证；补齐来源前不生成分录`
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
    const rowTreatment = treatment(group);
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
      leftCurrencyCode: factsCurrencyCode(group.leftFacts),
      leftSources: visibleLeftFacts.map(sourceSnapshot),
      leftHistoricalSourceCount: group.leftFacts.length - visibleLeftFacts.length,
      rightCompany: right?.name ?? "待确认对方公司",
      rightAccount: accountLabel(group.rightFacts),
      rightDirection,
      rightAmount: money(Math.abs(group.rightNetAmount)),
      rightCurrencyCode: factsCurrencyCode(group.rightFacts),
      rightSources: visibleRightFacts.map(sourceSnapshot),
      rightHistoricalSourceCount: group.rightFacts.length - visibleRightFacts.length,
      displayPeriodLabel: displayYear === undefined ? "全部期间" : `${displayYear}年`,
      sourceDisplayNote: displayYear === undefined
        ? "勾稽计算覆盖成立以来截至本期的全部凭证；来源按时间顺序并排，不代表逐笔对应。"
        : `勾稽计算覆盖成立以来截至本期的全部凭证；下表仅显示${displayYear}年凭证，来源按时间顺序并排，不代表逐笔对应。`,
      difference: group.differenceAmount,
      differenceCurrencyCode: group.comparisonCurrencyCode,
      status: comparisonStatus(group),
      reviewStatus,
      matchingRule: group.matchingRule,
      ...rowTreatment,
      targetLineCode: group.status === "matched" ? group.category : null,
      targetLineLabel: group.status === "matched" ? "抵销分录" : null,
      ownershipShareRatio: group.ownershipShareRatio,
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
        { code: { startsWith: "3002" } },
        { name: { contains: "实收资本" } }, { name: { contains: "股本" } },
        { name: { contains: "资本公积" } },
      ] },
    },
    include: {
      period: { select: { year: true, month: true } },
      account: { select: { id: true, code: true, name: true } },
    },
    orderBy: [{ period: { year: "asc" } }, { period: { month: "asc" } }, { id: "asc" }],
  });
  const entityByCompanyId = new Map(entities.map((entity) => [entity.companyId, entity]));
  const snapshotByCode = new Map(foreignEntities.map((entity) => [entity.companyCode, entity]));
  return selectFirstOpeningCapitalRows(rows).flatMap((row): ConsolidationAdjustmentComparison[] => {
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
      category: "reclassification",
      title: `${company?.name ?? "待确认公司"} 期初权益来源`,
      entrySummary: "先确认资金提供方、偿还义务和交易日；范围外主体代付形成偿还义务时转其他应付款，不与集团投资款抵销",
      leftCompany: investor?.name ?? "待确认投资方",
      leftAccount: "—",
      leftDirection: "—",
      leftAmount: 0,
      leftCurrencyCode: null,
      leftSources: [],
      leftHistoricalSourceCount: 0,
      rightCompany: company?.name ?? "待确认公司",
      rightAccount: `${row.account.code} ${row.account.name}`,
      rightDirection: signedOpening > 0 ? "借" : "贷",
      rightAmount: amount,
      rightCurrencyCode: currencyCode,
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
      differenceCurrencyCode: null,
      status: "missingCounterpart",
      reviewStatus: "exception",
      matchingRule: "从外币主体最早可用账期的实收资本、股本或资本公积期初余额识别；没有原始凭证时不推测投资方金额和汇率",
      treatmentKind: "confirmOpeningEquitySource",
      treatmentLabel: "确认来源；必要时转其他应付款",
      treatmentDetail: "若证据表明资金由合并范围外主体支付且加拿大主体负有偿还义务：按交易日汇率折合人民币，借记当前权益项目、贷记其他应付款；该事项是重分类，不是抵销。",
      targetLineCode: "otherPayables",
      targetLineLabel: "其他应付款（范围外主体）",
      ownershipShareRatio: snapshot.shareRatio === null ? null : Number(snapshot.shareRatio),
    }];
  });
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function buildTranslationOciComparisons(
  batch: ConsolidationBatchRow,
  entities: readonly ComparisonEntity[],
): ConsolidationAdjustmentComparison[] {
  const entityById = new Map(entities.map((entity) => [entity.companyId, entity]));
  const foreignEntities = batch.entities.filter((entity) => entity.isConsolidated
    && entity.functionalCurrency?.toUpperCase() !== "CNY");
  const payload = record(batch.outputSnapshot?.reportPayload);
  const statements = Array.isArray(payload?.statements) ? payload.statements : [];
  const balanceSheet = statements.map(record).find((statement) => statement?.reportType === "balanceSheet");
  const lines = Array.isArray(balanceSheet?.lines) ? balanceSheet.lines : [];
  const ociLine = lines.map(record).find((line) => line?.lineCode === "otherComprehensiveIncome");
  const entityAmounts = Array.isArray(ociLine?.entityAmounts) ? ociLine.entityAmounts.map(record).filter(Boolean) : [];
  const period = `${batch.year}-${String(batch.month).padStart(2, "0")}`;
  return foreignEntities.map((snapshot) => {
    const company = entityById.get(snapshot.companyId);
    const entityAmount = entityAmounts.find((item) => Number(item?.entitySnapshotId) === snapshot.id);
    const fallbackAmount = foreignEntities.length === 1 && ociLine ? Number(ociLine.sourceAmount ?? ociLine.amount) : Number.NaN;
    const rawAmount = entityAmount ? Number(entityAmount.amount) : fallbackAmount;
    const calculated = Number.isFinite(rawAmount);
    const amount = calculated ? money(Math.abs(rawAmount)) : 0;
    const currencyCode = snapshot.functionalCurrency?.toUpperCase() || "外币";
    const source = calculated ? [{
      voucherItemId: null,
      sourceKind: "translationCalculation" as const,
      voucherNo: "外币报表折算",
      voucherDate: period,
      accountCode: "translationBridge",
      accountName: "资产、负债及权益折算桥",
      description: "资产负债按期末汇率、历史权益按历史汇率，平衡差额单列其他综合收益",
      direction: rawAmount >= 0 ? "贷" as const : "借" as const,
      amount,
      currencyCode: "CNY",
    }] : [];
    return {
      key: `translationOci:${snapshot.companyId}`,
      entryId: null,
      category: "translation" as const,
      title: `${company?.name ?? snapshot.companyName} ${currencyCode} 报表折算`,
      entrySummary: calculated
        ? `折算平衡差额单列其他综合收益 CNY ${amount.toFixed(2)}`
        : "锁定批次时按冻结汇率计算，差额单列其他综合收益；不用于补平投资款对账",
      leftCompany: company?.name ?? snapshot.companyName,
      leftAccount: "外币报表折算桥",
      leftDirection: "—" as const,
      leftAmount: amount,
      leftCurrencyCode: calculated ? "CNY" : currencyCode,
      leftSources: source,
      leftHistoricalSourceCount: 0,
      rightCompany: "合并报表",
      rightAccount: "其他综合收益",
      rightDirection: "—" as const,
      rightAmount: amount,
      rightCurrencyCode: "CNY",
      rightSources: source,
      rightHistoricalSourceCount: 0,
      displayPeriodLabel: calculated ? "锁定输出" : "待锁定计算",
      sourceDisplayNote: calculated
        ? "金额来自锁定批次的不可变合并输出快照。"
        : "当前仅展示计算规则；最终金额在批次锁定时由冻结报表与汇率生成。",
      difference: 0,
      differenceCurrencyCode: calculated ? "CNY" : null,
      status: calculated ? "equal" as const : "pendingCalculation" as const,
      reviewStatus: calculated ? "calculated" as const : "informational" as const,
      matchingRule: "外币报表资产和负债采用期末汇率，历史权益采用有证据的历史汇率；折算后资产减负债和权益的差额单列其他综合收益",
      treatmentKind: "translationOci" as const,
      treatmentLabel: calculated ? "已计入其他综合收益" : "锁定时计入其他综合收益",
      treatmentDetail: "这是外币报表折算结果，不是加拿大收款与境内投资款之间的对账差额，也不生成双方抵销分录。",
      targetLineCode: "otherComprehensiveIncome",
      targetLineLabel: "其他综合收益（外币报表折算差额）",
      ownershipShareRatio: snapshot.shareRatio === null ? null : Number(snapshot.shareRatio),
    };
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
    ...buildTranslationOciComparisons(input.batch, input.entities),
  ];
}
