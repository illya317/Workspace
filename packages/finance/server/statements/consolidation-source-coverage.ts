import type {
  ConsolidationEntityCoverage,
  StatementSourceCoverage,
} from "@workspace/finance/types";
import type { ConsolidationReportSourceReadiness } from "./consolidation-source-readiness";

export function liveSourceCoverage(
  readiness?: ConsolidationReportSourceReadiness,
): StatementSourceCoverage {
  if (readiness?.ready) return {
    kind: "system",
    status: "available",
    label: "已就绪",
    detail: readiness.detail,
    lineCount: readiness.count,
    sourcedLineCount: readiness.count,
    manualLineCount: 0,
    importedLineCount: 0,
    formulaLineCount: 0,
  };
  return {
    kind: "missing",
    status: "missing",
    label: "未就绪",
    detail: readiness?.detail ?? "",
    lineCount: readiness?.count ?? 0,
    sourcedLineCount: readiness?.count ?? 0,
    manualLineCount: 0,
    importedLineCount: 0,
    formulaLineCount: 0,
  };
}

export function frozenSourceCoverage(source: {
  id: number;
  sourceKind: string;
  sourceStatus: string;
  workpaperId: number | null;
  workpaperVersion: number | null;
  lineCount: number;
  sourcedLineCount: number;
  manualLineCount: number;
  importedLineCount: number;
  formulaLineCount: number;
  fingerprint: string;
  evidence: string | null;
} | undefined): StatementSourceCoverage {
  if (!source) return liveSourceCoverage();
  const missing = source.sourceKind === "missing";
  return {
    snapshotId: source.id,
    kind: missing ? "missing" : "system",
    status: missing ? "missing" : "available",
    label: missing ? "未就绪" : "已就绪",
    detail: "",
    lineCount: source.lineCount,
    sourcedLineCount: source.sourcedLineCount,
    manualLineCount: source.manualLineCount,
    importedLineCount: source.importedLineCount,
    formulaLineCount: source.formulaLineCount,
    workpaperId: source.workpaperId,
    workpaperVersion: source.workpaperVersion,
    fingerprint: source.fingerprint,
    evidence: source.evidence,
  };
}

export function consolidationEntitySourceStatus(
  entity: Pick<ConsolidationEntityCoverage, "balanceSheet" | "incomeStatement" | "cashFlow" | "role" | "shareRatio">,
) {
  if (entity.role === "子公司" && (entity.shareRatio === null || entity.shareRatio <= 0 || entity.shareRatio > 1)) {
    return "blocked" as const;
  }
  const sources = [entity.balanceSheet, entity.incomeStatement, entity.cashFlow];
  if (sources.some((source) => source.kind === "missing")) return "blocked" as const;
  return "ready" as const;
}

export function consolidationSourcesReady(
  entityCount: number,
  sources: readonly { sourceKind: string }[],
) {
  return entityCount > 0
    && sources.length === entityCount * 3
    && sources.every((source) => source.sourceKind !== "missing");
}
