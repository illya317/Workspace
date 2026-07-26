import type { ConsolidationOverview } from "@workspace/finance/types";

type FxPolicy = ConsolidationOverview["fxPolicy"];
type FxPolicyInput = Omit<FxPolicy, "pair"> & { pair: string };

export interface ExchangeRateSummaryRow {
  key: string;
  pair: string;
  currentTargetDate: string;
  comparativeTargetDate: string;
  current: { rate: number; rateDate: string } | null;
  comparative: { rate: number; rateDate: string } | null;
  source: { name: string; field: string; url: string };
}

export function summarizeExchangeRates(fxPolicies: FxPolicyInput[]): ExchangeRateSummaryRow[] {
  return fxPolicies.map((fxPolicy) => ({
    key: fxPolicy.pair,
    pair: fxPolicy.pair,
    currentTargetDate: fxPolicy.periodEndDate,
    comparativeTargetDate: fxPolicy.comparativePeriodEndDate,
    current: fxPolicy.closingRate ? { rate: fxPolicy.closingRate.rate, rateDate: fxPolicy.closingRate.rateDate } : null,
    comparative: fxPolicy.comparativeClosingRate
      ? { rate: fxPolicy.comparativeClosingRate.rate, rateDate: fxPolicy.comparativeClosingRate.rateDate }
      : null,
    source: { name: fxPolicy.sourceName, field: fxPolicy.sourceField, url: fxPolicy.sourceUrl },
  }));
}
