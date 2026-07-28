function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

interface ComparativeSource {
  entitySnapshotId: number;
  reportType: string;
  reportPayload: unknown;
}

function reportRows(reportType: string, reportPayload: unknown) {
  const envelope = record(reportPayload);
  const payload = record(envelope?.payload) ?? envelope;
  if (!payload) return [];
  if (reportType === "balanceSheet") {
    return [payload.assets, payload.liabilities, payload.equity]
      .flatMap((value) => Array.isArray(value) ? value : []);
  }
  if (reportType !== "incomeStatement" && reportType !== "cashFlow") return [];
  return Array.isArray(payload.lines) ? payload.lines : [];
}

export function comparativePeriodEndDate(periodEnd: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(periodEnd);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return "";
  return new Date(Date.UTC(year - 1, month, 0)).toISOString().slice(0, 10);
}

export function sourceHasNonzeroPreviousAmount(source: Pick<ComparativeSource, "reportType" | "reportPayload">) {
  const hasNonzeroAccumulated = reportRows(source.reportType, source.reportPayload).some((value) => {
    const row = record(value);
    const previousAmount = typeof row?.previousAmount === "number" || typeof row?.previousAmount === "string"
      ? Number(row.previousAmount)
      : 0;
    return Number.isFinite(previousAmount) && Math.abs(previousAmount) > 0.005;
  });
  if (hasNonzeroAccumulated) return true;
  const envelope = record(source.reportPayload);
  const monthlyPeriods = record(envelope?.monthlyPeriods);
  const comparative = Array.isArray(monthlyPeriods?.comparative) ? monthlyPeriods.comparative : [];
  return comparative.some((period) => {
    const lines = record(period)?.lines;
    return Array.isArray(lines) && lines.some((value) => {
      const amount = Number(record(value)?.amount ?? 0);
      return Number.isFinite(amount) && Math.abs(amount) > 0.005;
    });
  });
}

export function comparativeEntitySnapshotIds(
  sources: ComparativeSource[],
) {
  return [...new Set(sources
    .filter(sourceHasNonzeroPreviousAmount)
    .map((source) => source.entitySnapshotId))];
}
