import type {
  ConsolidationBatchSnapshot,
  StatementReportType,
} from "@workspace/finance/types";

export interface StatementLineOption {
  value: string;
  label: string;
  reportType: StatementReportType;
  side: "debit" | "credit";
}

type LifecycleAction = "submit" | "review" | "lock" | "publish";

export function nextConsolidationLifecycleAction(
  status: ConsolidationBatchSnapshot["status"],
): LifecycleAction | null {
  if (status === "draft") return "submit";
  if (status === "submitted") return "review";
  if (status === "reviewed") return "lock";
  if (status === "locked") return "publish";
  return null;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function payloadRows(reportType: StatementReportType, payloadValue: unknown) {
  const envelope = object(payloadValue);
  const payload = object(envelope?.payload) ?? envelope;
  if (!payload) return [];
  if (reportType === "balanceSheet") {
    return [payload.assets, payload.liabilities, payload.equity]
      .flatMap((value) => Array.isArray(value) ? value : []);
  }
  return Array.isArray(payload.lines) ? payload.lines : [];
}

export function statementLineOptions(
  batch: ConsolidationBatchSnapshot | null,
  reportType: StatementReportType,
): StatementLineOption[] {
  const options = new Map<string, StatementLineOption>();
  for (const source of batch?.sources.filter((item) => item.reportType === reportType) ?? []) {
    for (const value of payloadRows(reportType, source.reportPayload)) {
      const row = object(value);
      const lineCode = typeof row?.lineCode === "string" ? row.lineCode.trim() : "";
      const label = typeof row?.label === "string" ? row.label.trim() : "";
      const side = row?.side === "debit" || row?.side === "credit" ? row.side : null;
      const derived = row?.isHeader === true || row?.isTotal === true || row?.isGrandTotal === true || row?.direction === "net";
      if (!lineCode || !label || !side || derived || options.has(lineCode)) continue;
      options.set(lineCode, { value: lineCode, label: `${label} · ${lineCode}`, reportType, side });
    }
  }
  return [...options.values()];
}
