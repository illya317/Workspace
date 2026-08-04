interface VoucherMatchingEvidence {
  label: string;
  companyCode: string;
  lineCode: "paidInCapital" | "capitalReserve";
  currencyCode: "CAD";
  originalAmount: number;
  historicalRate: number | null;
  actualContributionDate: string;
  actualExchangeRateDate: string | null;
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function parseVoucherMatchingEvidence(sourceMetadata: unknown): VoucherMatchingEvidence | null {
  const metadata = jsonRecord(sourceMetadata);
  const evidence = jsonRecord(metadata?.evidence);
  const matching = jsonRecord(evidence?.matching);
  if (!matching
    || typeof matching.label !== "string" || !matching.label.trim()
    || typeof matching.companyCode !== "string" || !matching.companyCode.trim()
    || (matching.lineCode !== "paidInCapital" && matching.lineCode !== "capitalReserve")
    || matching.currencyCode !== "CAD"
    || typeof matching.originalAmount !== "number" || !Number.isFinite(matching.originalAmount) || matching.originalAmount <= 0
    || (matching.historicalRate !== undefined
      && (typeof matching.historicalRate !== "number" || !Number.isFinite(matching.historicalRate) || matching.historicalRate <= 0))) {
    return null;
  }
  const actualContributionDate = typeof evidence?.actualContributionDate === "string"
    ? evidence.actualContributionDate
    : null;
  if (!actualContributionDate || !/^\d{4}-\d{2}-\d{2}$/.test(actualContributionDate)) return null;
  const actualExchangeRateDate = evidence?.actualExchangeRateDate === undefined
    ? null
    : typeof evidence.actualExchangeRateDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(evidence.actualExchangeRateDate)
      ? evidence.actualExchangeRateDate
      : null;
  if (evidence?.actualExchangeRateDate !== undefined && !actualExchangeRateDate) return null;
  return {
    label: matching.label.trim(),
    companyCode: matching.companyCode.trim(),
    lineCode: matching.lineCode,
    currencyCode: matching.currencyCode,
    originalAmount: money(matching.originalAmount),
    historicalRate: typeof matching.historicalRate === "number" ? matching.historicalRate : null,
    actualContributionDate,
    actualExchangeRateDate,
  };
}

export function preferredVoucherExchangeRateDate(matching: VoucherMatchingEvidence | null) {
  return matching?.actualExchangeRateDate ?? matching?.actualContributionDate ?? null;
}
