interface ReadinessLine {
  lineCode: string;
  matchSide: string | null;
  sourceKind: string | null;
  sourceId: string | null;
  sourceFingerprint: string | null;
  sourceAmount: unknown;
  sourceCurrency: string | null;
  counterpartyCompanyId: number | null;
}

interface ReadinessEntry {
  entryType: string;
  generationKey: string | null;
  matchDifference: unknown;
  differenceResolution: string | null;
  lines: ReadinessLine[];
}

export function consolidationEntryHasIncompleteMatchingEvidence(entry: ReadinessEntry) {
  if (!["investmentEquity", "intercompanyBalance"].includes(entry.entryType)) return false;
  const hasIncompleteLine = entry.lines.some((line) => {
    if (line.lineCode === "otherComprehensiveIncome") return false;
    const classifiedPolicyWorkpaper = entry.generationKey?.startsWith("policy:")
      && line.sourceKind === "workpaper";
    return !line.sourceKind
      || !line.sourceId
      || !line.sourceFingerprint
      || line.sourceAmount === null
      || !line.sourceCurrency
      || !line.counterpartyCompanyId
      || !line.matchSide && !classifiedPolicyWorkpaper;
  });
  return hasIncompleteLine
    || Number(entry.matchDifference ?? 0) > 0 && !entry.differenceResolution?.trim();
}
