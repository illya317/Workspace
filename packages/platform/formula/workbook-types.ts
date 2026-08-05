/**
 * Workbook formula trace contract — sibling of the field-expression
 * `FormulaEngineAdapter`. The existing field adapter stays untouched; this
 * contract handles normalized workbook sheets/cells with addresses, cached
 * values, precedents/dependents, and bounded transitive graphs.
 *
 * Invariants:
 * - The cached value and the recalculated value are separate immutable
 *   fields. A mismatch is evidence, never an auto-correction.
 * - HyperFormula range neighbors are expanded only inside the node/depth
 *   budgets; graph truncation is always reported explicitly.
 * - The adapter carries no Finance semantics: cells are addresses, scalars,
 *   and formula text only.
 */

export type WorkbookScalarValue = number | string | boolean | null;

/** Zero-based row/col inside a named sheet. */
export interface WorkbookCellAddress {
  sheet: string;
  row: number;
  col: number;
}

export interface WorkbookCellInput {
  address: WorkbookCellAddress;
  /** Literal cell content; ignored when `formula` is present. */
  value: WorkbookScalarValue;
  /** Raw formula text; a leading `=` is optional. */
  formula?: string | null;
  /** Cached formula result from the source workbook; `undefined` means not provided. */
  cachedValue?: WorkbookScalarValue;
  numberFormat?: string | null;
}

export interface WorkbookSheetInput {
  name: string;
  cells: readonly WorkbookCellInput[];
}

export interface WorkbookNamedExpressionInput {
  name: string;
  /** HyperFormula expression; must use absolute addresses. */
  expression: string;
}

export interface WorkbookCalculationMetadata {
  mode?: string;
  fullCalcOnLoad?: boolean;
}

export interface WorkbookTraceRequest {
  sheets: readonly WorkbookSheetInput[];
  namedExpressions?: readonly WorkbookNamedExpressionInput[];
  calculation?: WorkbookCalculationMetadata;
  /** Cells the caller wants explained; duplicates are traced once. */
  roots: readonly WorkbookCellAddress[];
  /** Root depth is 0; a node at depth `maxDepth` is never expanded further. */
  maxDepth: number;
  /** Maximum traced cells (roots plus expanded precedents). */
  maxNodes: number;
}

export type WorkbookTrustStatus =
  | "cached_only"
  | "recalculated_match"
  | "recalculated_mismatch"
  | "unsupported"
  | "error";

export type WorkbookCellEvaluationStatus = "literal" | "ok" | "error";

export type WorkbookDiagnosticKind =
  | "cycle"
  | "missing_sheet"
  | "missing_named_expression"
  | "unsupported_function"
  | "evaluation_error"
  | "named_expression_rejected"
  | "cached_value_missing"
  | "graph_truncated"
  | "range_expansion_truncated";

export interface WorkbookDiagnostic {
  kind: WorkbookDiagnosticKind;
  message: string;
  address?: WorkbookCellAddress;
}

export interface WorkbookTracedCell {
  address: WorkbookCellAddress;
  formula: string | null;
  numberFormat: string | null;
  /** Source cached value, exactly as provided; never overwritten. */
  cachedValue: WorkbookScalarValue;
  cachedValueProvided: boolean;
  /** Independent HyperFormula recalculation; never written back into cachedValue. */
  recalculatedValue: WorkbookScalarValue;
  recalculatedError: { type: string; message: string } | null;
  evaluation: WorkbookCellEvaluationStatus;
  trust: WorkbookTrustStatus;
  /** Immediate precedents, ranges expanded within budget. */
  precedents: readonly WorkbookCellAddress[];
  /** Immediate dependents, ranges expanded within budget. */
  dependents: readonly WorkbookCellAddress[];
  /** Machine-readable unsupported feature markers, e.g. `function:FOOBAR`. */
  unsupportedFeatures: readonly string[];
}

/** Directed edge from precedent to dependent inside the bounded transitive graph. */
export interface WorkbookGraphEdge {
  from: WorkbookCellAddress;
  to: WorkbookCellAddress;
}

export interface WorkbookTraceResult {
  adapterId: string;
  adapterVersion: string;
  /** Every traced cell: roots plus budget-expanded precedents. */
  cells: readonly WorkbookTracedCell[];
  edges: readonly WorkbookGraphEdge[];
  truncated: boolean;
  truncation: { nodes: boolean; depth: boolean };
  diagnostics: readonly WorkbookDiagnostic[];
  stats: {
    visitedNodes: number;
    maxDepthReached: number;
    edgeCount: number;
  };
}

export interface WorkbookFormulaEngineAdapter {
  readonly id: string;
  readonly version: string;
  trace(request: WorkbookTraceRequest): Promise<WorkbookTraceResult>;
}

/** Thrown when a trace request is malformed; the adapter fails closed. */
export class WorkbookTraceRequestError extends Error {
  readonly name = "WorkbookTraceRequestError";
}
