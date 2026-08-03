import type { ConsolidationRateReferenceSnapshot } from "@workspace/finance/types";
import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";

export function hasMonthlyAverageRateEvidence(
  rates: readonly {
    rateKind: string;
    applications: unknown;
  }[],
) {
  return rates.some((rate) => rate.rateKind === "monthlyAverage"
    && Array.isArray(rate.applications)
    && rate.applications.some((application) => (
      application && typeof application === "object" && "applicationType" in application
      && application.applicationType === "flowAverage"
    )));
}

export function cnyPerForeignUnit(
  rate: ConsolidationRateReferenceSnapshot,
): DomainValidationResult<number> {
  if (rate.baseCurrency.toUpperCase() !== "CAD" || rate.quoteCurrency.toUpperCase() !== "CNY") {
    return failCommand("当前合并输出仅支持 CAD/CNY 冻结汇率", 409, "exchangeRates");
  }
  const normalized = Number(rate.rate);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return failCommand("批次冻结汇率不是有效正数", 409, "exchangeRates");
  }
  return okCommand(normalized);
}

export function historicalEquityRate(
  rates: readonly ConsolidationRateReferenceSnapshot[],
  entitySnapshotId: number,
  periodBasis: "current" | "comparative",
  lineCode: "paidInCapital" | "capitalReserve",
): DomainValidationResult<number | null> {
  const bindings = rates.flatMap((rate) => rate.applications
    .filter((application) => (
      (application.applicationType === "historicalInvestment" || application.applicationType === "historicalCapital")
      && application.periodBasis === periodBasis
      && application.entitySnapshotId === entitySnapshotId
      && (application.applicationType === "historicalCapital"
        ? application.capitalLineCode === lineCode
        : (application.voucher?.matchingLineCode ?? "capitalReserve") === lineCode)
    ))
    .map((application) => ({ rate, application })));
  if (bindings.length === 0) return okCommand(null);
  let originalAmountTotal = 0;
  let translatedAmountTotal = 0;
  for (const binding of bindings) {
    if (binding.rate.rateKind !== "historicalInvestment"
      && binding.rate.rateKind !== "centralParity"
      && binding.rate.rateKind !== "historicalCapitalAmount") {
      return failCommand(`CAD 实体 ${entitySnapshotId} 的投资日应用引用了非历史汇率`, 409, "rateApplications");
    }
    const originalAmount = binding.application.voucher?.originalAmount ?? binding.application.capitalOriginalAmount;
    if (originalAmount === null || originalAmount === undefined || !Number.isFinite(originalAmount) || originalAmount <= 0) {
      return failCommand(`CAD 实体 ${entitySnapshotId} 的权益资本历史汇率缺少有效原币金额`, 409, "rateApplications");
    }
    originalAmountTotal += originalAmount;
    if (binding.application.capitalHistoricalAmountCny) {
      translatedAmountTotal += binding.application.capitalHistoricalAmountCny;
    } else {
      const normalizedRate = cnyPerForeignUnit(binding.rate);
      if (!normalizedRate.ok) return normalizedRate;
      translatedAmountTotal += originalAmount * normalizedRate.data;
    }
  }
  return okCommand(translatedAmountTotal / originalAmountTotal);
}
