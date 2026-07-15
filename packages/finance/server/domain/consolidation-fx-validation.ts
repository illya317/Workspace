import type { ConsolidationRateApplicationSnapshot } from "@workspace/finance/types";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

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
    verifiedBy: number | null;
    verifiedAt: string | null;
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
    if (!rate.verifiedBy || !rate.verifiedAt || !Number.isFinite(Date.parse(rate.verifiedAt))) {
      return failCommand("批次汇率必须保留独立复核人和复核时间", 409, "exchangeRates");
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
      const targetDate = periodBasis === "current" ? facts.periodEnd : facts.comparativePeriodEnd;
      const closing = rateApplications.filter(({ application }) =>
        application.applicationType === "closing"
        && application.periodBasis === periodBasis
        && application.entitySnapshotId === entity.id,
      );
      if (closing.length !== (expected ? 1 : 0)) {
        return failCommand(
          expected
            ? `每个适用的 CAD 本位币实体必须且只能绑定一条${periodBasis === "current" ? "本期" : "比较期"}期末汇率`
            : "没有非零上期数的 CAD 实体不能绑定比较期期末汇率",
          409,
          "rateApplications",
        );
      }
      if (!expected) continue;
      const { rate, application } = closing[0]!;
      if (rate.rateKind !== "closing"
        || application.targetDate !== targetDate
        || application.voucherItemId !== null
        || application.voucher !== null
        || !validRateDate(targetDate, rate.rateDate)) {
        return failCommand(
          `CAD ${periodBasis === "current" ? "本期" : "比较期"}期末汇率必须采用对应期末或此前7日内的已复核 closing 牌价`,
          409,
          "rateApplications",
        );
      }
    }
  }

  const requiredInvestmentIds = new Set(facts.requiredInvestmentVoucherIds);
  const appliedCurrentInvestmentIds = new Set<number>();
  const currentInvestmentById = new Map<number, ConsolidationRateApplicationSnapshot>();
  const comparativeInvestmentById = new Map<number, ConsolidationRateApplicationSnapshot>();
  for (const { rate, application } of rateApplications) {
    const entity = entityById.get(application.entitySnapshotId);
    if (!entity) return failCommand("汇率应用引用了批次范围外实体", 409, "rateApplications");
    if (entity.functionalCurrency !== "CAD") {
      return failCommand("只有 CAD 本位币实体可以绑定 CAD/CNY 汇率", 409, "rateApplications");
    }
    if (application.periodBasis !== "current" && application.periodBasis !== "comparative") {
      return failCommand("汇率应用缺少有效的本期或比较期口径", 409, "rateApplications");
    }
    if (application.applicationType === "closing") continue;
    const voucher = application.voucher;
    if (rate.rateKind !== "historicalInvestment"
      || !application.voucherItemId
      || !voucher
      || application.targetDate !== voucher.voucherDate
      || voucher.currencyCode?.toUpperCase() !== "CAD"
      || voucher.originalAmount === null
      || !validRateDate(application.targetDate, rate.rateDate)) {
      return failCommand("投资款必须绑定投资日或此前7日内的已复核 historicalInvestment 牌价及原币凭证", 409, "rateApplications");
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
        || voucher.voucherDate > facts.comparativePeriodEnd)) {
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
      && application.voucher!.voucherDate <= facts.comparativePeriodEnd
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
