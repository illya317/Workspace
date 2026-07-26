export interface StoredChinaMoneyRateEvidence {
  rate: { toFixed(decimalPlaces: number): string };
  sourceName: string;
  sourceField: string;
  publishedAt: Date | null;
  note: string | null;
}

export interface NextChinaMoneyRateEvidence {
  rate: number;
  sourceName: string;
  sourceField: string;
  publishedAt: Date;
  note: string;
}

export function isSameChinaMoneyRateEvidence(
  stored: StoredChinaMoneyRateEvidence,
  next: NextChinaMoneyRateEvidence,
) {
  return stored.rate.toFixed(8) === next.rate.toFixed(8)
    && stored.sourceName === next.sourceName
    && stored.sourceField === next.sourceField
    && stored.publishedAt?.getTime() === next.publishedAt.getTime()
    && stored.note === next.note;
}

export function chinaMoneyHistorySourceCoversTargetDate(
  sourceUrl: string,
  targetDate: string,
) {
  try {
    return new URL(sourceUrl).searchParams.get("endDate") === targetDate;
  } catch {
    return false;
  }
}
