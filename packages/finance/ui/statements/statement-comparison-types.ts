import type {
  AmountOriginBudgets,
  AmountOriginExplanation,
  AmountOriginProviderDiagnostics,
  EvidenceRef,
  StatementTargetRef,
} from "@workspace/finance/types/statement-explanation";

/**
 * 差异诊断 UI DTO（Package 7）：镜像 comparison GET 路由的稳定 wire 形状。
 * 只引用 @workspace/finance/types 的公共合同；不引入 server 私有类型。
 */

export type ComparisonReportType = "balance" | "income" | "cashflow";

export interface ComparisonTargetPreviewDto {
  target: StatementTargetRef;
  lineCount: number;
  currencyCode: string;
  targetLabel: string;
}

export interface ComparisonPackageListItemDto {
  id: number;
  fileName: string;
  sha256: string;
  fileSize: number;
  lifecycle: string;
  failureCode: string | null;
  createdAt: string;
  mappingCount: number;
  runCount: number;
}

export interface ComparisonSheetInventoryItemDto {
  name: string;
  visibility: string;
  cellCount: number;
}

export interface ComparisonMappedAmountColumnDto {
  col: number;
  headerText: string | null;
}

export interface ComparisonStructureMappingDto {
  sheetName: string;
  sheetIndex: number;
  visibility: "visible" | "hidden" | "veryHidden";
  reportType: ComparisonReportType;
  score: number;
  headerRow: number | null;
  labelColumn: number;
  blockStartRow: number;
  blockEndRow: number;
  amountColumns: ComparisonMappedAmountColumnDto[];
  mergedHeader: boolean;
}

export type ComparisonLineMappingStatus = "auto_accepted" | "ambiguous" | "duplicate" | "unmatched";

export interface ComparisonLineMappingEntryDto {
  label: string;
  normalizedLabel: string;
  row: number;
  labelCell: string;
  status: ComparisonLineMappingStatus;
  lineCode: string | null;
  candidates: string[];
  amountCells: string[];
}

export interface ComparisonMappingProposalDto {
  structure: ComparisonStructureMappingDto;
  lines: ComparisonLineMappingEntryDto[];
  missingLines: { lineCode: string; label: string }[];
  autoAcceptedCount: number;
  pendingCount: number;
}

export interface ComparisonMappingDetectionDto {
  proposals: ComparisonMappingProposalDto[];
  best: ComparisonMappingProposalDto | null;
  warnings: string[];
}

export interface ComparisonRunListItemDto {
  id: number;
  status: string;
  failureCode: string | null;
  inputFingerprint: string;
  outputFingerprint: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ComparisonMappingItemDto {
  id: number;
  revision: number;
  status: string;
  targetKind: string;
  reportType: string;
  targetFingerprint: string;
  confirmedAt: string | null;
  updatedAt: string;
  runs: ComparisonRunListItemDto[];
}

export interface ComparisonPackageDetailDto {
  id: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
  sha256: string;
  parserVersion: string;
  lifecycle: string;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  sheets: ComparisonSheetInventoryItemDto[];
  detection: ComparisonMappingDetectionDto | null;
  mappings: ComparisonMappingItemDto[];
}

export interface ComparisonRunSummaryDto {
  totalLines: number;
  differingLines: number;
  exact: number;
  near: number;
  ambiguous: number;
  notFound: number;
  truncated: number;
  notEvaluated: number;
  totalAbsoluteResidual: string;
  accountingTreatment: "not_evaluated";
}

export interface ComparisonExternalCellDto {
  sheet: string;
  a1: string;
  type: string;
  value: unknown;
  text: string | null;
  formula: string | null;
  cachedValue: unknown;
  recalculatedValue: unknown;
  trust: string | null;
}

export interface ComparisonLineDiagnosticsDto {
  accountingTreatment: "not_evaluated";
  stopReason: string;
  candidatesTruncated: boolean;
  budgets: AmountOriginBudgets;
  versions: {
    orchestrator: string;
    solverAdapterId: string | null;
    solverAdapterVersion: string | null;
  };
  fingerprints: { input: string; output: string };
  providers: readonly AmountOriginProviderDiagnostics[];
  solver: {
    candidateCount: number;
    visitedStates: number;
    solutionCount: number;
    truncated: boolean;
  } | null;
}

export interface ComparisonRunLineDto {
  lineCode: string;
  lineLabel: string;
  sortOrder: number;
  sourceSheet: string | null;
  sourceCell: string | null;
  externalAmount: string | null;
  systemAmount: string | null;
  differenceAmount: string | null;
  explainedAmount: string | null;
  residualAmount: string | null;
  explanationStatus: string;
  explanationMethod: string | null;
  evidence: readonly EvidenceRef[];
  alternatives: readonly AmountOriginExplanation[];
  diagnostics: ComparisonLineDiagnosticsDto | null;
  externalCell: ComparisonExternalCellDto | null;
}

export interface ComparisonRunDetailDto {
  id: number;
  mappingId: number;
  status: string;
  failureCode: string | null;
  failureMessage: string | null;
  targetFingerprint: string;
  orchestratorId: string;
  orchestratorVersion: string;
  formulaAdapterId: string | null;
  formulaAdapterVersion: string | null;
  solverAdapterId: string | null;
  solverAdapterVersion: string | null;
  inputFingerprint: string;
  outputFingerprint: string | null;
  createdAt: string;
  completedAt: string | null;
  summary: ComparisonRunSummaryDto | null;
  lines: ComparisonRunLineDto[];
}

/** 上传响应（POST /comparisons）：瞬态返回检测提案。 */
export interface ComparisonUploadResultDto {
  packageId: number;
  lifecycle: string;
  sha256: string;
  detection: ComparisonMappingDetectionDto | null;
}

export function parseComparisonRunLine(line: ComparisonRunLineDto): ComparisonRunLineDto {
  return {
    ...line,
    evidence: Array.isArray(line.evidence) ? line.evidence : [],
    alternatives: Array.isArray(line.alternatives) ? line.alternatives : [],
    diagnostics: line.diagnostics ?? null,
    externalCell: line.externalCell ?? null,
  };
}
