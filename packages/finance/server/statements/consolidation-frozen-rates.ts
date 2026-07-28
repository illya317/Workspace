import type { ConsolidationRateReferenceSnapshot } from "@workspace/finance/types";
import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";

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
): DomainValidationResult<number | null> {
  const bindings = rates.flatMap((rate) => rate.applications
    .filter((application) => (
      (application.applicationType === "historicalInvestment"
        || application.applicationType === "historicalCapital"
          && (application.equityLineCode === "paidInCapital" || application.equityLineCode === "capitalReserve"))
      && application.periodBasis === periodBasis
      && application.entitySnapshotId === entitySnapshotId
    ))
    .map((application) => ({ rate, application })));
  if (bindings.length === 0) return okCommand(null);
  let originalAmountTotal = 0;
  let translatedAmountTotal = 0;
  for (const binding of bindings) {
    if (binding.rate.rateKind !== "historicalInvestment" && binding.rate.rateKind !== "centralParity") {
      return failCommand(`CAD 实体 ${entitySnapshotId} 的投资日应用引用了非历史汇率`, 409, "rateApplications");
    }
    const originalAmount = binding.application.voucher?.originalAmount ?? binding.application.capitalOriginalAmount;
    if (originalAmount === null || originalAmount === undefined || !Number.isFinite(originalAmount) || originalAmount <= 0) {
      return failCommand(`CAD 实体 ${entitySnapshotId} 的权益资本历史汇率缺少有效原币金额`, 409, "rateApplications");
    }
    const normalizedRate = cnyPerForeignUnit(binding.rate);
    if (!normalizedRate.ok) return normalizedRate;
    originalAmountTotal += originalAmount;
    translatedAmountTotal += originalAmount * normalizedRate.data;
  }
  return okCommand(translatedAmountTotal / originalAmountTotal);
}

export function historicalEquityTranslation(
  rates: readonly ConsolidationRateReferenceSnapshot[],
  entitySnapshotId: number,
  periodBasis: "current" | "comparative",
  equityLineCode: string,
): DomainValidationResult<{ originalAmount: number; translatedAmount: number } | null> {
  const bindings = rates.flatMap((rate) => rate.applications
    .filter((application) => (
      (application.applicationType === "historicalCapital" || application.applicationType === "historicalEquity")
      && application.periodBasis === periodBasis
      && application.entitySnapshotId === entitySnapshotId
      && application.equityLineCode === equityLineCode
    ))
    .map((application) => ({ rate, application })));
  if (bindings.length === 0) return okCommand(null);
  let originalAmount = 0;
  let translatedAmount = 0;
  for (const binding of bindings) {
    const sourceAmount = binding.application.capitalOriginalAmount;
    if (sourceAmount === null || sourceAmount === undefined || !Number.isFinite(sourceAmount) || sourceAmount === 0) {
      return failCommand(`CAD 实体 ${entitySnapshotId} 的 ${equityLineCode} 历史折算缺少非零原币金额`, 409, "rateApplications");
    }
    if (binding.application.applicationType === "historicalEquity"
      ? binding.rate.rateKind !== "monthlyAverage" && binding.rate.rateKind !== "centralParity" && binding.rate.rateKind !== "historicalInvestment"
      : binding.rate.rateKind !== "centralParity" && binding.rate.rateKind !== "historicalInvestment") {
      return failCommand(`CAD 实体 ${entitySnapshotId} 的 ${equityLineCode} 引用了不适用的历史汇率`, 409, "rateApplications");
    }
    const normalizedRate = cnyPerForeignUnit(binding.rate);
    if (!normalizedRate.ok) return normalizedRate;
    originalAmount += sourceAmount;
    translatedAmount += sourceAmount * normalizedRate.data;
  }
  return okCommand({ originalAmount, translatedAmount });
}
