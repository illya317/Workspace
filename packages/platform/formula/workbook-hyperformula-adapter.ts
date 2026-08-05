import { DetailedCellError, ErrorType, HyperFormula, type SimpleCellAddress } from "hyperformula";
import {
  WorkbookTraceRequestError,
  type WorkbookCellAddress,
  type WorkbookCellInput,
  type WorkbookDiagnostic,
  type WorkbookFormulaEngineAdapter,
  type WorkbookGraphEdge,
  type WorkbookScalarValue,
  type WorkbookTracedCell,
  type WorkbookTraceRequest,
  type WorkbookTraceResult,
  type WorkbookTrustStatus,
} from "./workbook-types";

/**
 * Workbook formula trace adapter backed by the repository's existing
 * HyperFormula 3.3.0 installation (`licenseKey: "gpl-v3"`, approved license
 * basis recorded in `docs/engineering/finance-amount-explanation-platform-adr.md`).
 *
 * Trust semantics:
 * - Literal cells are `cached_only`; their raw value is the only channel.
 * - Formula cells compare the source cached value against an independent
 *   recalculation; both fields stay separate and immutable, and a mismatch
 *   is reported as evidence, never corrected.
 * - A formula cell without a provided cached value reports
 *   `recalculated_match` plus an explicit `cached_value_missing` diagnostic:
 *   the recalculated channel is uncontradicted, and the missing channel is
 *   never silent.
 * - HyperFormula range neighbors are expanded only inside the node/depth
 *   budgets; every truncation sets `truncated` plus an explicit diagnostic.
 */
export class WorkbookHyperFormulaAdapter implements WorkbookFormulaEngineAdapter {
  readonly id = "platform.formula.workbook-hyperformula";
  readonly version = HyperFormula.version;

  // Declared async so fail-closed validation errors surface as rejections, not sync throws.
  async trace(request: WorkbookTraceRequest): Promise<WorkbookTraceResult> {
    validateTraceRequest(request);

    const diagnostics: WorkbookDiagnostic[] = [];
    const cellInputs = new Map<string, WorkbookCellInput>();
    for (const sheet of request.sheets) {
      for (const cell of sheet.cells) {
        cellInputs.set(cellKey(cell.address), cell);
      }
    }

    const hf = buildEngine(request, diagnostics);
    const sheetNames = new Set(request.sheets.map((sheet) => sheet.name));
    const sheetNameById = new Map<number, string>();
    if (hf) {
      for (const name of sheetNames) {
        const id = hf.getSheetId(name);
        if (id !== undefined) sheetNameById.set(id, name);
      }
    }

    // Breadth-first precedent closure from the roots, bounded by maxNodes/maxDepth.
    const visited = new Map<string, { address: WorkbookCellAddress; depth: number }>();
    const queue: { address: WorkbookCellAddress; depth: number }[] = [];
    const precedentsByNode = new Map<string, WorkbookCellAddress[]>();
    const edges: WorkbookGraphEdge[] = [];
    let nodesTruncated = false;
    let depthTruncated = false;
    let maxDepthReached = 0;
    let graphTruncationReported = false;

    const reportGraphTruncation = (kind: "graph_truncated" | "range_expansion_truncated", message: string, address?: WorkbookCellAddress) => {
      diagnostics.push({ kind, message, address });
    };
    const reportNodeBudget = (address?: WorkbookCellAddress) => {
      nodesTruncated = true;
      if (!graphTruncationReported) {
        graphTruncationReported = true;
        reportGraphTruncation("graph_truncated", `Node budget ${request.maxNodes} exhausted; transitive graph is truncated.`, address);
      }
    };

    for (const root of request.roots) {
      if (!sheetNames.has(root.sheet)) {
        diagnostics.push({ kind: "missing_sheet", message: `Sheet "${root.sheet}" does not exist in the input workbook.`, address: root });
        continue;
      }
      const key = cellKey(root);
      if (visited.has(key)) continue;
      if (visited.size >= request.maxNodes) {
        reportNodeBudget(root);
        break;
      }
      visited.set(key, { address: root, depth: 0 });
      queue.push({ address: root, depth: 0 });
    }

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const { address, depth } = queue[cursor];
      maxDepthReached = Math.max(maxDepthReached, depth);
      const nodeKey = cellKey(address);
      const input = cellInputs.get(nodeKey);
      if (depth >= request.maxDepth) {
        if (input?.formula) {
          depthTruncated = true;
          diagnostics.push({ kind: "graph_truncated", message: `Depth budget ${request.maxDepth} reached; precedents of ${formatAddress(address)} were not expanded.`, address });
        }
        precedentsByNode.set(nodeKey, []);
        continue;
      }
      const nodePrecedents: WorkbookCellAddress[] = [];
      precedentsByNode.set(nodeKey, nodePrecedents);
      if (!hf) continue;
      const hfAddress = toHFAddress(hf, address);
      if (!hfAddress) continue;
      for (const neighbor of safeNeighbors(() => hf.getCellPrecedents(hfAddress))) {
        for (const precedent of expandNeighbor(hf, sheetNameById, neighbor, request.maxNodes - visited.size, () => {
          nodesTruncated = true;
          reportGraphTruncation("range_expansion_truncated", `Range neighbor of ${formatAddress(address)} exceeds the remaining node budget; expanded partially.`, address);
        })) {
          nodePrecedents.push(precedent);
          edges.push({ from: precedent, to: address });
          const precedentKey = cellKey(precedent);
          if (visited.has(precedentKey)) continue;
          if (visited.size >= request.maxNodes) {
            reportNodeBudget(precedent);
            continue;
          }
          visited.set(precedentKey, { address: precedent, depth: depth + 1 });
          queue.push({ address: precedent, depth: depth + 1 });
        }
      }
    }

    const cells: WorkbookTracedCell[] = [];
    for (const { address } of visited.values()) {
      cells.push(this.describeCell(hf, sheetNameById, cellInputs.get(cellKey(address)), address, precedentsByNode.get(cellKey(address)) ?? [], request.maxNodes, diagnostics));
    }

    const truncated = nodesTruncated || depthTruncated;
    return {
      adapterId: this.id,
      adapterVersion: this.version,
      cells,
      edges,
      truncated,
      truncation: { nodes: nodesTruncated, depth: depthTruncated },
      diagnostics,
      stats: { visitedNodes: visited.size, maxDepthReached, edgeCount: edges.length },
    };
  }

  private describeCell(
    hf: HyperFormula | null,
    sheetNameById: Map<number, string>,
    input: WorkbookCellInput | undefined,
    address: WorkbookCellAddress,
    precedents: readonly WorkbookCellAddress[],
    dependentsCap: number,
    diagnostics: WorkbookDiagnostic[],
  ): WorkbookTracedCell {
    const formula = input?.formula ?? null;
    const cachedValueProvided = input?.cachedValue !== undefined;
    const cachedValue = input?.cachedValue ?? (formula ? null : input?.value ?? null);
    const unsupportedFeatures: string[] = [];
    let recalculatedValue: WorkbookScalarValue = null;
    let recalculatedError: { type: string; message: string } | null = null;
    let trust: WorkbookTrustStatus;
    let evaluation: WorkbookTracedCell["evaluation"];

    const hfAddress = hf ? toHFAddress(hf, address) : null;
    const raw = hf && hfAddress ? hf.getCellValue(hfAddress) : (input?.value ?? null);

    if (raw instanceof DetailedCellError) {
      evaluation = "error";
      recalculatedError = { type: raw.type, message: raw.message };
      const functionMatch = /Function name (\S+) not recognized/i.exec(raw.message);
      const namedExpressionMatch = /Named expression (\S+) not recognized/i.exec(raw.message);
      if (raw.type === ErrorType.NAME && functionMatch) {
        trust = "unsupported";
        unsupportedFeatures.push(`function:${functionMatch[1]}`);
        diagnostics.push({ kind: "unsupported_function", message: raw.message, address });
      } else if (raw.type === ErrorType.NAME && namedExpressionMatch) {
        trust = "error";
        diagnostics.push({ kind: "missing_named_expression", message: raw.message, address });
      } else if (raw.type === ErrorType.REF && /sheet does not exist/i.test(raw.message)) {
        trust = "error";
        diagnostics.push({ kind: "missing_sheet", message: raw.message, address });
      } else if (raw.type === ErrorType.CYCLE) {
        trust = "error";
        diagnostics.push({ kind: "cycle", message: `Circular dependency involving ${formatAddress(address)}.`, address });
      } else {
        trust = "error";
        diagnostics.push({ kind: "evaluation_error", message: raw.message || `Cell ${formatAddress(address)} evaluated to ${raw.value}.`, address });
      }
    } else {
      recalculatedValue = normalizeScalar(raw);
      if (!formula) {
        evaluation = "literal";
        trust = "cached_only";
      } else {
        evaluation = "ok";
        if (cachedValueProvided) {
          trust = scalarEquals(cachedValue, recalculatedValue) ? "recalculated_match" : "recalculated_mismatch";
        } else {
          trust = "recalculated_match";
          diagnostics.push({ kind: "cached_value_missing", message: `No cached value provided for ${formatAddress(address)}; only the recalculated channel exists.`, address });
        }
      }
    }

    const dependents: WorkbookCellAddress[] = [];
    if (hf && hfAddress) {
      for (const neighbor of safeNeighbors(() => hf.getCellDependents(hfAddress))) {
        for (const dependent of expandNeighbor(hf, sheetNameById, neighbor, dependentsCap - dependents.length, () => {
          diagnostics.push({ kind: "range_expansion_truncated", message: `Dependents of ${formatAddress(address)} exceed the expansion budget; listed partially.`, address });
        })) {
          dependents.push(dependent);
        }
        if (dependents.length >= dependentsCap) break;
      }
    }

    return {
      address,
      formula,
      numberFormat: input?.numberFormat ?? null,
      cachedValue,
      cachedValueProvided,
      recalculatedValue,
      recalculatedError,
      evaluation,
      trust,
      precedents,
      dependents,
      unsupportedFeatures,
    };
  }
}

function buildEngine(request: WorkbookTraceRequest, diagnostics: WorkbookDiagnostic[]): HyperFormula | null {
  if (request.sheets.length === 0) return null;
  const sheets: Record<string, (string | number | boolean | null)[][]> = {};
  for (const sheet of request.sheets) {
    let rows = 0;
    let cols = 0;
    for (const cell of sheet.cells) {
      rows = Math.max(rows, cell.address.row + 1);
      cols = Math.max(cols, cell.address.col + 1);
    }
    const matrix: (string | number | boolean | null)[][] = Array.from({ length: Math.max(rows, 1) }, () =>
      Array.from({ length: Math.max(cols, 1) }, () => null),
    );
    for (const cell of sheet.cells) {
      matrix[cell.address.row][cell.address.col] = cell.formula ? normalizeFormula(cell.formula) : cell.value;
    }
    sheets[sheet.name] = matrix;
  }
  const hf = HyperFormula.buildFromSheets(sheets, { licenseKey: "gpl-v3" });
  for (const namedExpression of request.namedExpressions ?? []) {
    try {
      hf.addNamedExpression(namedExpression.name, namedExpression.expression);
    } catch (error) {
      diagnostics.push({
        kind: "named_expression_rejected",
        message: `Named expression "${namedExpression.name}" rejected: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  return hf;
}

type Neighbor = SimpleCellAddress | { start: SimpleCellAddress; end: SimpleCellAddress };

function expandNeighbor(
  hf: HyperFormula,
  sheetNameById: Map<number, string>,
  neighbor: Neighbor,
  remainingBudget: number,
  onTruncated: () => void,
): WorkbookCellAddress[] {
  const resolveSheet = (id: number) => sheetNameById.get(id) ?? hf.getSheetName(id) ?? String(id);
  if (!("start" in neighbor)) {
    return [{ sheet: resolveSheet(neighbor.sheet), row: neighbor.row, col: neighbor.col }];
  }
  const expanded: WorkbookCellAddress[] = [];
  const total = (neighbor.end.row - neighbor.start.row + 1) * (neighbor.end.col - neighbor.start.col + 1);
  const limit = Math.max(remainingBudget, 0);
  if (total > limit) onTruncated();
  outer: for (let row = neighbor.start.row; row <= neighbor.end.row; row += 1) {
    for (let col = neighbor.start.col; col <= neighbor.end.col; col += 1) {
      if (expanded.length >= limit) break outer;
      expanded.push({ sheet: resolveSheet(neighbor.start.sheet), row, col });
    }
  }
  return expanded;
}

function safeNeighbors(read: () => readonly unknown[]): readonly Neighbor[] {
  try {
    return read() as readonly Neighbor[];
  } catch {
    return [];
  }
}

function toHFAddress(hf: HyperFormula, address: WorkbookCellAddress): SimpleCellAddress | null {
  const sheet = hf.getSheetId(address.sheet);
  if (sheet === undefined) return null;
  return { sheet, row: address.row, col: address.col };
}

function cellKey(address: WorkbookCellAddress): string {
  return `${address.sheet}\u001f${address.row}\u001f${address.col}`;
}

function formatAddress(address: WorkbookCellAddress): string {
  return `${address.sheet}!R${address.row + 1}C${address.col + 1}`;
}

function normalizeFormula(formula: string): string {
  return formula.startsWith("=") ? formula : `=${formula}`;
}

function normalizeScalar(value: unknown): WorkbookScalarValue {
  if (typeof value === "number") return Number.isFinite(value) ? (Object.is(value, -0) ? 0 : value) : null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  return null;
}

function scalarEquals(a: WorkbookScalarValue, b: WorkbookScalarValue): boolean {
  const normalize = (value: WorkbookScalarValue) => (typeof value === "number" && Object.is(value, -0) ? 0 : value);
  return Object.is(normalize(a), normalize(b));
}

function validateTraceRequest(request: WorkbookTraceRequest): void {
  const fail = (message: string): never => {
    throw new WorkbookTraceRequestError(message);
  };
  if (!Number.isInteger(request.maxDepth) || request.maxDepth < 0) fail("maxDepth must be an integer >= 0.");
  if (!Number.isInteger(request.maxNodes) || request.maxNodes < 1) fail("maxNodes must be an integer >= 1.");
  const sheetNames = new Set<string>();
  for (const sheet of request.sheets) {
    if (!sheet.name) fail("sheet name must be non-empty.");
    if (sheetNames.has(sheet.name)) fail(`duplicate sheet "${sheet.name}".`);
    sheetNames.add(sheet.name);
    for (const cell of sheet.cells) validateAddress(cell.address, fail);
  }
  for (const root of request.roots) validateAddress(root, fail);
}

function validateAddress(address: WorkbookCellAddress, fail: (message: string) => never): void {
  if (!address.sheet) fail("cell address sheet must be non-empty.");
  if (!Number.isInteger(address.row) || address.row < 0 || !Number.isInteger(address.col) || address.col < 0) {
    fail("cell address row/col must be integers >= 0.");
  }
}
