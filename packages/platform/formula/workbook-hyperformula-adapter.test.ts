import assert from "node:assert/strict";
import test from "node:test";
import { WorkbookHyperFormulaAdapter } from "./workbook-hyperformula-adapter";
import {
  WorkbookTraceRequestError,
  type WorkbookCellAddress,
  type WorkbookTraceRequest,
  type WorkbookTraceResult,
} from "./workbook-types";

function address(sheet: string, row: number, col: number): WorkbookCellAddress {
  return { sheet, row, col };
}

function baseRequest(overrides: Partial<WorkbookTraceRequest> = {}): WorkbookTraceRequest {
  return {
    sheets: [
      {
        name: "Sheet1",
        cells: [
          { address: address("Sheet1", 0, 0), value: 10 },
          { address: address("Sheet1", 0, 1), value: 20 },
          { address: address("Sheet1", 1, 0), value: 1 },
          { address: address("Sheet1", 1, 1), value: 2 },
          { address: address("Sheet1", 0, 2), value: null, formula: "=A1+B1", cachedValue: 30 },
        ],
      },
      {
        name: "Sheet2",
        cells: [
          { address: address("Sheet2", 0, 0), value: null, formula: "=Sheet1!C1*2", cachedValue: 60 },
          { address: address("Sheet2", 0, 1), value: null, formula: "=SUM(Sheet1!A1:B2)", cachedValue: 33 },
        ],
      },
    ],
    roots: [address("Sheet2", 0, 0)],
    maxDepth: 8,
    maxNodes: 100,
    ...overrides,
  };
}

function cellAt(result: WorkbookTraceResult, sheet: string, row: number, col: number) {
  const cell = result.cells.find((item) => item.address.sheet === sheet && item.address.row === row && item.address.col === col);
  assert.ok(cell, `expected traced cell ${sheet}!${row},${col}`);
  return cell;
}

function diagnosticsOfKind(result: WorkbookTraceResult, kind: string) {
  return result.diagnostics.filter((diagnostic) => diagnostic.kind === kind);
}

test("cross-sheet precedents are traced and matching cached values stay distinct from recalculated values", async () => {
  const adapter = new WorkbookHyperFormulaAdapter();
  const result = await adapter.trace(baseRequest());

  assert.equal(result.truncated, false);
  const root = cellAt(result, "Sheet2", 0, 0);
  assert.equal(root.trust, "recalculated_match");
  assert.equal(root.cachedValue, 60);
  assert.equal(root.recalculatedValue, 60);
  assert.deepEqual(root.precedents, [address("Sheet1", 0, 2)]);

  const precedent = cellAt(result, "Sheet1", 0, 2);
  assert.equal(precedent.formula, "=A1+B1");
  assert.equal(precedent.trust, "recalculated_match");
  assert.deepEqual(precedent.dependents, [address("Sheet2", 0, 0)]);

  assert.equal(cellAt(result, "Sheet1", 0, 0).trust, "cached_only");
  assert.equal(cellAt(result, "Sheet1", 0, 1).trust, "cached_only");
  assert.deepEqual(
    result.edges.map((edge) => [edge.from, edge.to]),
    [
      [address("Sheet1", 0, 2), address("Sheet2", 0, 0)],
      [address("Sheet1", 0, 0), address("Sheet1", 0, 2)],
      [address("Sheet1", 0, 1), address("Sheet1", 0, 2)],
    ],
  );
  assert.equal(result.stats.visitedNodes, 4);
  assert.equal(result.stats.edgeCount, 3);
});

test("cached/recalculated mismatch is evidence and never auto-corrected", async () => {
  const adapter = new WorkbookHyperFormulaAdapter();
  const request = baseRequest();
  const sheets = request.sheets.map((sheet) => ({
    ...sheet,
    cells: sheet.cells.map((cell) =>
      cell.address.sheet === "Sheet2" && cell.address.row === 0 && cell.address.col === 0 ? { ...cell, cachedValue: 61 } : cell,
    ),
  }));
  const result = await adapter.trace({ ...request, sheets });

  const root = cellAt(result, "Sheet2", 0, 0);
  assert.equal(root.trust, "recalculated_mismatch");
  assert.equal(root.cachedValue, 61);
  assert.equal(root.recalculatedValue, 60);
});

test("range precedents expand into individual cells inside the node budget", async () => {
  const adapter = new WorkbookHyperFormulaAdapter();
  const result = await adapter.trace(baseRequest({ roots: [address("Sheet2", 0, 1)] }));

  const root = cellAt(result, "Sheet2", 0, 1);
  assert.equal(root.recalculatedValue, 33);
  assert.deepEqual(root.precedents, [
    address("Sheet1", 0, 0),
    address("Sheet1", 0, 1),
    address("Sheet1", 1, 0),
    address("Sheet1", 1, 1),
  ]);
  assert.equal(result.truncated, false);
  assert.equal(result.stats.visitedNodes, 5);
});

test("node budget truncation is explicit and expands ranges only partially", async () => {
  const adapter = new WorkbookHyperFormulaAdapter();
  const result = await adapter.trace(baseRequest({ roots: [address("Sheet2", 0, 1)], maxNodes: 2 }));

  assert.equal(result.truncated, true);
  assert.equal(result.truncation.nodes, true);
  assert.equal(result.stats.visitedNodes, 2);
  assert.deepEqual(cellAt(result, "Sheet2", 0, 1).precedents, [address("Sheet1", 0, 0)]);
  assert.equal(diagnosticsOfKind(result, "range_expansion_truncated").length > 0, true);
});

test("depth budget stops transitive expansion and is reported explicitly", async () => {
  const adapter = new WorkbookHyperFormulaAdapter();
  const result = await adapter.trace(baseRequest({ maxDepth: 1 }));

  assert.equal(result.truncated, true);
  assert.equal(result.truncation.depth, true);
  assert.equal(result.stats.visitedNodes, 2);
  assert.equal(result.stats.maxDepthReached, 1);
  // Sheet1!C1 has a formula but its precedents stay unexpanded at the depth budget.
  assert.deepEqual(cellAt(result, "Sheet1", 0, 2).precedents, []);
  assert.equal(diagnosticsOfKind(result, "graph_truncated").length > 0, true);
});

test("circular references surface cycle diagnostics and error trust", async () => {
  const adapter = new WorkbookHyperFormulaAdapter();
  const result = await adapter.trace({
    sheets: [
      {
        name: "Loop",
        cells: [
          { address: address("Loop", 0, 0), value: null, formula: "=B1", cachedValue: 0 },
          { address: address("Loop", 0, 1), value: null, formula: "=A1", cachedValue: 0 },
        ],
      },
    ],
    roots: [address("Loop", 0, 0)],
    maxDepth: 8,
    maxNodes: 50,
  });

  const root = cellAt(result, "Loop", 0, 0);
  assert.equal(root.trust, "error");
  assert.equal(root.recalculatedError?.type, "CYCLE");
  assert.equal(diagnosticsOfKind(result, "cycle").length > 0, true);
  // The cycle closes on an already-visited node; traversal terminates.
  assert.equal(result.stats.visitedNodes, 2);
});

test("references to missing sheets and missing roots produce missing_sheet diagnostics", async () => {
  const adapter = new WorkbookHyperFormulaAdapter();
  const result = await adapter.trace({
    sheets: [
      {
        name: "Main",
        cells: [{ address: address("Main", 0, 0), value: null, formula: "=NoSheet!A1+1", cachedValue: 5 }],
      },
    ],
    roots: [address("Main", 0, 0), address("Ghost", 0, 0)],
    maxDepth: 4,
    maxNodes: 20,
  });

  const root = cellAt(result, "Main", 0, 0);
  assert.equal(root.trust, "error");
  const missing = diagnosticsOfKind(result, "missing_sheet");
  assert.equal(missing.length, 2);
  assert.equal(result.cells.some((cell) => cell.address.sheet === "Ghost"), false);
});

test("unsupported functions are reported as features and never silently evaluated", async () => {
  const adapter = new WorkbookHyperFormulaAdapter();
  const result = await adapter.trace({
    sheets: [
      {
        name: "Main",
        cells: [{ address: address("Main", 0, 0), value: null, formula: "=FOOBAR(1)", cachedValue: 9 }],
      },
    ],
    roots: [address("Main", 0, 0)],
    maxDepth: 4,
    maxNodes: 20,
  });

  const root = cellAt(result, "Main", 0, 0);
  assert.equal(root.trust, "unsupported");
  assert.deepEqual(root.unsupportedFeatures, ["function:FOOBAR"]);
  assert.equal(root.cachedValue, 9);
  assert.equal(root.recalculatedValue, null);
  assert.equal(diagnosticsOfKind(result, "unsupported_function").length, 1);
});

test("named expressions resolve, missing names are diagnostics, invalid names are rejected", async () => {
  const adapter = new WorkbookHyperFormulaAdapter();
  const result = await adapter.trace({
    sheets: [
      {
        name: "Main",
        cells: [
          { address: address("Main", 0, 0), value: null, formula: "=Rate*3", cachedValue: 6 },
          { address: address("Main", 1, 0), value: null, formula: "=UnknownName+1", cachedValue: 1 },
        ],
      },
    ],
    namedExpressions: [
      { name: "Rate", expression: "=2" },
      { name: "Bad", expression: "=A1" },
    ],
    roots: [address("Main", 0, 0), address("Main", 1, 0)],
    maxDepth: 4,
    maxNodes: 20,
  });

  const resolved = cellAt(result, "Main", 0, 0);
  assert.equal(resolved.recalculatedValue, 6);
  assert.equal(resolved.trust, "recalculated_match");

  const missing = cellAt(result, "Main", 1, 0);
  assert.equal(missing.trust, "error");
  assert.equal(diagnosticsOfKind(result, "missing_named_expression").length, 1);
  assert.equal(diagnosticsOfKind(result, "named_expression_rejected").length, 1);
});

test("formula cells without a cached value report the missing channel explicitly", async () => {
  const adapter = new WorkbookHyperFormulaAdapter();
  const result = await adapter.trace({
    sheets: [
      {
        name: "Main",
        cells: [
          { address: address("Main", 0, 0), value: 4 },
          { address: address("Main", 0, 1), value: null, formula: "=A1*2" },
        ],
      },
    ],
    roots: [address("Main", 0, 1)],
    maxDepth: 4,
    maxNodes: 20,
  });

  const root = cellAt(result, "Main", 0, 1);
  assert.equal(root.trust, "recalculated_match");
  assert.equal(root.cachedValueProvided, false);
  assert.equal(root.recalculatedValue, 8);
  assert.equal(diagnosticsOfKind(result, "cached_value_missing").length, 1);
});

test("adapter reports id and version, and traces are deterministic", async () => {
  const adapter = new WorkbookHyperFormulaAdapter();
  assert.equal(adapter.id, "platform.formula.workbook-hyperformula");
  assert.equal(adapter.version, "3.3.0");

  const first = await adapter.trace(baseRequest({ roots: [address("Sheet2", 0, 0), address("Sheet2", 0, 1)] }));
  const second = await adapter.trace(baseRequest({ roots: [address("Sheet2", 0, 0), address("Sheet2", 0, 1)] }));
  assert.equal(first.adapterId, adapter.id);
  assert.equal(first.adapterVersion, adapter.version);
  assert.deepEqual(second, first);
});

test("malformed trace requests fail closed", async () => {
  const adapter = new WorkbookHyperFormulaAdapter();
  await assert.rejects(adapter.trace(baseRequest({ maxDepth: -1 })), WorkbookTraceRequestError);
  await assert.rejects(adapter.trace(baseRequest({ maxNodes: 0 })), WorkbookTraceRequestError);
  await assert.rejects(
    adapter.trace(baseRequest({ sheets: [{ name: "S", cells: [] }, { name: "S", cells: [] }] })),
    WorkbookTraceRequestError,
  );
});
