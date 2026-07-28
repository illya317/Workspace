import type { ConsolidationRateApplicationSnapshot } from "@workspace/finance/types";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import {
  consolidationMonthEndDate,
  consolidationPeriodRateRequirements,
} from "../statements/consolidation-period-rates";

export interface ConsolidationFxValidationFacts {
  periodEnd: string;
  comparativePeriodEnd: string;
  entities: {
    id: number;
    functionalCurrency: string | null;
    currencyEvidence: string | null;
  }[];
  rates: {
    exchangeRateId: number;
    rateKind: string;
    rateDate: string;
    recordedBy: number | null;
    recordedAt: string | null;
    applications: ConsolidationRateApplicationSnapshot[];
  }[];
  requiredInvestmentVoucherIds: number[];
  requiredComparativeEntityIds: number[];
}

function daysBefore(targetDate: string, rateDate: string) {
  return (Date.parse(`${targetDate}T00:00:00Z`) - Date.parse(`${rateDate}T00:00:00Z`)) / 86_400_000;
}

function validRateDate(targetDate: string, rateDate: string) {
  const difference = daysBefore(targetDate, rateDate);
  return Number.isFinite(difference) && difference >= 0 && difference <= 7;
}

export function validateConsolidationFxFacts(
  facts: ConsolidationFxValidationFacts,
): DomainValidationResult<{ ready: true }> {
  const periodMatch = /^(\d{4})-(\d{2})-\d{2}$/.exec(facts.periodEnd);
  if (!periodMatch) return failCommand("合并期间截止日无效", 409, "periodEnd");
  const requirements = consolidationPeriodRateRequirements(Number(periodMatch[1]), Number(periodMatch[2]));
  const comparativeEquityPeriodEnd = consolidationMonthEndDate(Number(periodMatch[1]) - 1, 12);
  const entityById = new Map(facts.entities.map((entity) => [entity.id, entity]));
  for (const entity of facts.entities) {
    if (!entity.functionalCurrency || !entity.currencyEvidence?.trim()) {
      return failCommand("每个合并实体都必须确认本位币并保留判断依据", 409, "currencyPolicies");
    }
    if (entity.functionalCurrency !== "CNY" && entity.functionalCurrency !== "CAD") {
      return failCommand("当前合并批次仅支持 CNY 或 CAD 本位币", 409, "functionalCurrency");
    }
  }
  for (const rate of facts.rates) {
    if (!rate.recordedBy || !rate.recordedAt || !Number.isFinite(Date.parse(rate.recordedAt))) {
      return failCommand("批次汇率必须保留录入人和录入时间", 409, "exchangeRates");
    }
  }

  const rateApplications = facts.rates.flatMap((rate) => rate.applications.map((application) => ({
    rate,
    application,
  })));
  const cadEntities = facts.entities.filter((entity) => entity.functionalCurrency === "CAD");
  const comparativeEntityIds = new Set(facts.requiredComparativeEntityIds);
  if ([...comparativeEntityIds].some((id) => entityById.get(id)?.functionalCurrency !== "CAD")) {
    return failCommand("比较期汇率要求引用了范围外或非 CAD 实体", 409, "rateApplications");
  }
  for (const entity of cadEntities) {
    for (const periodBasis of ["current", "comparative"] as const) {
      const expected = periodBasis === "current" || comparativeEntityIds.has(entity.id);
      const closing = rateApplications.filter(({ application }) =>
        application.applicationType === "closing"
        && application.periodBasis === periodBasis
        && application.entitySnapshotId === entity.id,
      );
      const expectedDates = expected ? requirements.closing[periodBasis] : [];
      if (closing.length !== expectedDates.length) {
        return failCommand(
          expected
            ? `每个适用的 CAD 本位币实体必须完整绑定${periodBasis === "current" ? "本期" : "比较期"}现金及资产负债表所需期末汇率`
            : "没有非零上期数的 CAD 实体不能绑定比较期期末汇率",
          409,
          "rateApplications",
        );
      }
      if (!expected) continue;
      for (const targetDate of expectedDates) {
        const matches = closing.filter(({ application }) => application.targetDate === targetDate);
        const match = matches[0];
        if (matches.length !== 1 || !match
          || (match.rate.rateKind !== "closing" && match.rate.rateKind !== "centralParity")
          || match.application.voucherItemId !== null
          || match.application.voucher !== null
          || !validRateDate(targetDate, match.rate.rateDate)) {
          return failCommand(
            `CAD ${periodBasis === "current" ? "本期" : "比较期"}期末汇率必须逐时点采用对应日期或此前7日内的人民币汇率中间价`,
            409,
            "rateApplications",
          );
        }
      }
    }
    for (const periodBasis of ["current", "comparative"] as const) {
      const expected = periodBasis === "current" || comparativeEntityIds.has(entity.id);
      const averages = rateApplications.filter(({ application }) =>
        application.applicationType === "monthlyAverage"
        && application.periodBasis === periodBasis
        && application.entitySnapshotId === entity.id,
      );
      const expectedDates = expected ? requirements.monthlyAverage[periodBasis] : [];
      if (averages.length !== expectedDates.length) {
        return failCommand(
          expected
            ? `每个适用的 CAD 本位币实体必须完整绑定${periodBasis === "current" ? "本期" : "比较期"}逐月平均汇率`
            : "没有非零上期数的 CAD 实体不能绑定比较期月平均汇率",
          409,
          "rateApplications",
        );
      }
      if (!expected) continue;
      for (const targetDate of expectedDates) {
        const matches = averages.filter(({ application }) => application.targetDate === targetDate);
        const match = matches[0];
        if (matches.length !== 1 || !match
          || match.rate.rateKind !== "monthlyAverage"
          || match.rate.rateDate !== targetDate
          || match.application.voucherItemId !== null
          || match.application.voucher !== null) {
          return failCommand(
            `CAD ${periodBasis === "current" ? "本期" : "比较期"}期间发生额必须逐月采用对应月份的人民币汇率中间价月平均`,
            409,
            "rateApplications",
          );
        }
      }
    }
  }

  const requiredInvestmentIds = new Set(facts.requiredInvestmentVoucherIds);
  const appliedCurrentInvestmentIds = new Set<number>();
  const currentInvestmentById = new Map<number, ConsolidationRateApplicationSnapshot>();
  const comparativeInvestmentById = new Map<number, ConsolidationRateApplicationSnapshot>();
  const historicalCapitalKeys = new Set<string>();
  for (const { rate, application } of rateApplications) {
    const entity = entityById.get(application.entitySnapshotId);
    if (!entity) return failCommand("汇率应用引用了批次范围外实体", 409, "rateApplications");
    if (entity.functionalCurrency !== "CAD") {
      return failCommand("只有 CAD 本位币实体可以绑定 CAD/CNY 汇率", 409, "rateApplications");
    }
    if (application.periodBasis !== "current" && application.periodBasis !== "comparative") {
      return failCommand("汇率应用缺少有效的本期或比较期口径", 409, "rateApplications");
    }
    if (application.applicationType === "closing" || application.applicationType === "monthlyAverage") continue;
    if (application.applicationType === "historicalCapital" || application.applicationType === "historicalEquity") {
      const key = `${application.entitySnapshotId}:${application.periodBasis}:${application.equityLineCode}:${application.targetDate}`;
      if (historicalCapitalKeys.has(key)) {
        return failCommand("同一境外实体、期间口径、权益项目和发生日只能绑定一条权益历史汇率", 409, "rateApplications");
      }
      const validHistoricalRate = application.applicationType === "historicalEquity"
        ? rate.rateKind === "monthlyAverage"
          ? rate.rateDate === application.targetDate
          : (rate.rateKind === "historicalInvestment" || rate.rateKind === "centralParity")
            && validRateDate(application.targetDate, rate.rateDate)
        : (rate.rateKind === "historicalInvestment" || rate.rateKind === "centralParity")
          && validRateDate(application.targetDate, rate.rateDate);
      if (!validHistoricalRate
        || application.voucherItemId !== null
        || application.voucher !== null
        || !application.equityLineCode
        || !application.capitalOriginalAmount
        || application.applicationType === "historicalEquity" && application.equityLineCode !== "undistributedProfit"
        || application.applicationType === "historicalCapital" && application.equityLineCode === "undistributedProfit"
        || application.periodBasis === "comparative" && application.targetDate > comparativeEquityPeriodEnd) {
        return failCommand("境外权益必须绑定对应发生日汇率、权益项目和非零原币金额", 409, "rateApplications");
      }
      historicalCapitalKeys.add(key);
      continue;
    }
    const voucher = application.voucher;
    if ((rate.rateKind !== "historicalInvestment" && rate.rateKind !== "centralParity")
      || !application.voucherItemId
      || !voucher
      || application.targetDate !== voucher.voucherDate
      || voucher.currencyCode?.toUpperCase() !== "CAD"
      || voucher.originalAmount === null
      || !validRateDate(application.targetDate, rate.rateDate)) {
      return failCommand("投资款必须绑定投资日或此前7日内的人民币汇率中间价及原币凭证", 409, "rateApplications");
    }
    if (!requiredInvestmentIds.has(application.voucherItemId)) {
      return failCommand("投资日汇率绑定了当前批次不适用的凭证明细", 409, "rateApplications");
    }
    const applications = application.periodBasis === "current"
      ? currentInvestmentById
      : comparativeInvestmentById;
    if (applications.has(application.voucherItemId)) {
      return failCommand("同一投资凭证明细在同一期间口径不能重复绑定历史汇率", 409, "rateApplications");
    }
    if (application.periodBasis === "comparative"
      && (!comparativeEntityIds.has(application.entitySnapshotId)
        || voucher.voucherDate > comparativeEquityPeriodEnd)) {
      return failCommand("比较期投资历史汇率只能覆盖比较期末前已发生且主体存在上期数的投资", 409, "rateApplications");
    }
    applications.set(application.voucherItemId, application);
    if (application.periodBasis === "current") appliedCurrentInvestmentIds.add(application.voucherItemId);
  }
  if ([...requiredInvestmentIds].some((id) => !appliedCurrentInvestmentIds.has(id))) {
    return failCommand("每笔 CAD 投资凭证都必须绑定本期投资日历史汇率", 409, "rateApplications");
  }
  const expectedComparativeInvestmentIds = new Set([...currentInvestmentById]
    .filter(([, application]) => (
      comparativeEntityIds.has(application.entitySnapshotId)
      && application.voucher!.voucherDate <= comparativeEquityPeriodEnd
    ))
    .map(([id]) => id));
  if ([...expectedComparativeInvestmentIds].some((id) => {
    const current = currentInvestmentById.get(id);
    const comparative = comparativeInvestmentById.get(id);
    return !comparative || comparative.entitySnapshotId !== current?.entitySnapshotId;
  }) || [...comparativeInvestmentById.keys()].some((id) => !expectedComparativeInvestmentIds.has(id))) {
    return failCommand("比较期投资历史汇率必须完整覆盖比较期末前已发生的适用投资，且与本期被投资主体一致", 409, "rateApplications");
  }
  return okCommand({ ready: true });
}
