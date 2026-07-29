import type { FinanceSourceTraceInput, TreasurySourceTraceDto } from "../../types/treasury";

export function date(value: string | null | undefined) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export function dateDto(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function timestampDto(value: Date) {
  return value.toISOString();
}

export function traceData(input: FinanceSourceTraceInput) {
  return {
    sourceKind: input.sourceKind ?? null,
    sourceReleaseId: input.sourceReleaseId ?? null,
    sourceSha256: input.sourceSha256 ?? null,
    sourceFile: input.sourceFile ?? null,
    sourceSheet: input.sourceSheet ?? null,
    sourceRow: input.sourceRow ?? null,
    sourceRange: input.sourceRange ?? null,
    sourceKey: input.sourceKey ?? null,
  };
}

export function traceDto(row: FinanceSourceTraceInput): TreasurySourceTraceDto {
  return traceData(row);
}
