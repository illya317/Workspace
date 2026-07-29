import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { mock } from "node:test";

mock.module("server-only", { namedExports: {} } as never);

const { inspectInventoryCountFacts, inspectInventoryRecordFacts } = await import("./closing-adapter");
const scope = { companyCode: "C01", year: 2026, month: 6 };

function inspectionFingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

test("inventory record inspection is invariant to fact ordering but changes with real amounts", () => {
  const facts: Parameters<typeof inspectInventoryRecordFacts>[1] = {
    applicableItemCount: 2, documentCount: 2, draftDocumentIds: [12, 11], postedDocumentIds: [22, 21],
    incompletePostedDocuments: [
      { id: 22, documentNo: "OUT-22", lineCount: 3, ledgerEntryCount: 2 },
      { id: 21, documentNo: "OUT-21", lineCount: 2, ledgerEntryCount: 1 },
    ],
    orphanLedgerEntryIds: [32, 31], uncostedLedgerEntryIds: [42, 41],
    periodClose: { id: 50, status: "closed", voucherId: 60 }, targetPeriodId: 6,
    postingProposal: [
      { accountCode: "6401", direction: "debit", amount: 70 },
      { accountCode: "1405", direction: "credit", amount: 120 },
      { accountCode: "6401", direction: "debit", amount: 50 },
    ],
    linkedVoucher: {
      id: 60, companyCode: "C01", periodId: 6, status: "posted", totalDebit: 120, totalCredit: 120,
      lines: [
        { accountCode: "6401", debit: 70, credit: 0 },
        { accountCode: "1405", debit: 0, credit: 120 },
        { accountCode: "6401", debit: 50, credit: 0 },
      ],
    },
  };
  const original = inspectInventoryRecordFacts(scope, facts);
  const reordered = inspectInventoryRecordFacts(scope, {
    ...facts,
    draftDocumentIds: [...facts.draftDocumentIds].reverse(), postedDocumentIds: [...facts.postedDocumentIds].reverse(),
    incompletePostedDocuments: [...facts.incompletePostedDocuments].reverse(),
    orphanLedgerEntryIds: [...facts.orphanLedgerEntryIds].reverse(), uncostedLedgerEntryIds: [...facts.uncostedLedgerEntryIds].reverse(),
    postingProposal: [...facts.postingProposal].reverse(),
    linkedVoucher: { ...facts.linkedVoucher!, lines: [...facts.linkedVoucher!.lines].reverse() },
  });
  const changed = inspectInventoryRecordFacts(scope, {
    ...facts,
    postingProposal: facts.postingProposal.map((row, index) => index === 0 ? { ...row, amount: 70.01 } : row),
  });

  assert.deepEqual(reordered, original);
  assert.equal(inspectionFingerprint(reordered), inspectionFingerprint(original));
  assert.notEqual(inspectionFingerprint(changed), inspectionFingerprint(original));
});

test("inventory count inspection canonicalizes stocktakes, lines and linked documents", () => {
  const documents = (seed: number, itemId: number) => [
    { id: seed + 1, documentNo: `ADJ-${seed + 1}`, documentType: "adjustment", documentDate: "2026-06-30", status: "posted", itemId, warehouseId: 1, batchId: null, signedQuantity: 0.6, ledgerEntryId: seed + 101 },
    { id: seed, documentNo: `ADJ-${seed}`, documentType: "adjustment", documentDate: "2026-06-30", status: "posted", itemId, warehouseId: 1, batchId: null, signedQuantity: 0.4, ledgerEntryId: seed + 100 },
  ];
  const facts: Parameters<typeof inspectInventoryCountFacts>[1] = {
    expectedStockDimensions: [
      { itemId: 3, warehouseId: 1, batchId: null, onHandQuantity: 1 },
      { itemId: 1, warehouseId: 1, batchId: null, onHandQuantity: 1 },
      { itemId: 2, warehouseId: 1, batchId: null, onHandQuantity: 1 },
    ],
    stocktakes: [
      { id: 72, stocktakeNo: "ST-72", warehouseId: 1, status: "approved", lines: [{ id: 723, itemId: 3, warehouseId: 1, batchId: null, variance: 1, linkedDocuments: documents(730, 3) }] },
      { id: 71, stocktakeNo: "ST-71", warehouseId: 1, status: "approved", lines: [
        { id: 712, itemId: 2, warehouseId: 1, batchId: null, variance: 1, linkedDocuments: documents(720, 2) },
        { id: 711, itemId: 1, warehouseId: 1, batchId: null, variance: 1, linkedDocuments: documents(710, 1) },
      ] },
    ],
  };
  const original = inspectInventoryCountFacts(scope, facts);
  const reordered = inspectInventoryCountFacts(scope, {
    expectedStockDimensions: [...facts.expectedStockDimensions].reverse(),
    stocktakes: [...facts.stocktakes].reverse().map((stocktake) => ({ ...stocktake, lines: [...stocktake.lines].reverse().map((line) => ({ ...line, linkedDocuments: [...line.linkedDocuments].reverse() })) })),
  });
  const changed = inspectInventoryCountFacts(scope, {
    ...facts,
    stocktakes: facts.stocktakes.map((stocktake) => ({ ...stocktake, lines: stocktake.lines.map((line) => line.id === 711 ? {
      ...line,
      linkedDocuments: line.linkedDocuments.map((document, index) => index === 0 ? { ...document, signedQuantity: 0.59 } : document),
    } : line) })),
  });

  assert.equal(original.status, "ready");
  assert.deepEqual(reordered, original);
  assert.equal(inspectionFingerprint(reordered), inspectionFingerprint(original));
  assert.equal(changed.status, "blocked");
  assert.notEqual(inspectionFingerprint(changed), inspectionFingerprint(original));
});
