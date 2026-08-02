import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("server-only", { namedExports: {} } as never);

const { classifyInventoryRecordIntegrity, inspectInventoryCountFacts, inspectInventoryRecordFacts } = await import("./closing-adapter");

const scope = { companyCode: "C01", year: 2026, month: 6 };

test("inventory records require complete immutable ledgers and a matching closing voucher", () => {
  const facts: Parameters<typeof inspectInventoryRecordFacts>[1] = {
    applicableItemCount: 2,
    documentCount: 1,
    draftDocumentIds: [],
    postedDocumentIds: [10],
    incompletePostedDocuments: [],
    orphanLedgerEntryIds: [],
    uncostedLedgerEntryIds: [],
    periodClose: { id: 20, status: "closed", voucherId: 30 },
    targetPeriodId: 99,
    postingProposal: [
      { accountCode: "6401", direction: "debit", amount: 120 },
      { accountCode: "1405", direction: "credit", amount: 120 },
    ],
    linkedVoucher: {
      id: 30,
      companyCode: "C01",
      periodId: 99,
      status: "posted",
      totalDebit: 120,
      totalCredit: 120,
      lines: [
        { accountCode: "6401", debit: 120, credit: 0 },
        { accountCode: "1405", debit: 0, credit: 120 },
      ],
    },
  };
  const ready = inspectInventoryRecordFacts(scope, facts);
  assert.equal(ready.status, "ready");
  assert.deepEqual(ready.voucherRefs, ["finance-voucher:30"]);
  assert.equal((ready.payload as { targetPeriodId: number }).targetPeriodId, 99);
  assert.deepEqual((ready.payload as { linkedVoucher: unknown }).linkedVoucher, {
    id: 30,
    companyCode: "C01",
    periodId: 99,
    status: "posted",
    totalDebit: 120,
    totalCredit: 120,
    items: [
      { accountCode: "1405", debit: 0, credit: 120 },
      { accountCode: "6401", debit: 120, credit: 0 },
    ],
  });

  const mismatch = inspectInventoryRecordFacts(scope, {
    ...facts,
    incompletePostedDocuments: [{ id: 10, documentNo: "OUT-10", lineCount: 2, ledgerEntryCount: 1 }],
    linkedVoucher: { ...facts.linkedVoucher!, totalDebit: 80, totalCredit: 0, lines: [{ accountCode: "6401", debit: 80, credit: 0 }] },
  });
  assert.equal(mismatch.status, "blocked");
  assert.deepEqual(mismatch.blockers.map((item) => item.code), [
    "inventory_posted_document_ledger_incomplete",
    "inventory_closing_voucher_mismatch",
  ]);

  const reversed = inspectInventoryRecordFacts(scope, {
    ...facts,
    linkedVoucher: { ...facts.linkedVoucher!, status: "reversed" },
  });
  assert.equal(reversed.status, "blocked");
  assert.equal(reversed.blockers[0]?.code, "inventory_closing_voucher_mismatch");
});

test("closing voucher rejects wrong scope, unbalanced totals and extra entries", () => {
  const base: Parameters<typeof inspectInventoryRecordFacts>[1] = {
    applicableItemCount: 1,
    documentCount: 1,
    draftDocumentIds: [],
    postedDocumentIds: [10],
    incompletePostedDocuments: [],
    orphanLedgerEntryIds: [],
    uncostedLedgerEntryIds: [],
    periodClose: { id: 20, status: "closed", voucherId: 30 },
    targetPeriodId: 99,
    postingProposal: [
      { accountCode: "6401", direction: "debit", amount: 120 },
      { accountCode: "1405", direction: "credit", amount: 120 },
    ],
    linkedVoucher: {
      id: 30,
      companyCode: "C01",
      periodId: 99,
      status: "posted",
      totalDebit: 120,
      totalCredit: 120,
      lines: [
        { accountCode: "6401", debit: 120, credit: 0 },
        { accountCode: "1405", debit: 0, credit: 120 },
      ],
    },
  };
  const invalidVouchers: NonNullable<typeof base.linkedVoucher>[] = [
    { ...base.linkedVoucher!, companyCode: "C02" },
    { ...base.linkedVoucher!, periodId: 100 },
    { ...base.linkedVoucher!, totalDebit: 120, totalCredit: 119 },
    {
      ...base.linkedVoucher!,
      totalDebit: 121,
      totalCredit: 121,
      lines: [
        ...base.linkedVoucher!.lines,
        { accountCode: "1002", debit: 1, credit: 0 },
        { accountCode: "2202", debit: 0, credit: 1 },
      ],
    },
  ];
  for (const linkedVoucher of invalidVouchers) {
    const inspection = inspectInventoryRecordFacts(scope, { ...base, linkedVoucher });
    assert.equal(inspection.status, "blocked");
    assert.equal(inspection.blockers[0]?.code, "inventory_closing_voucher_mismatch");
  }
});

test("closing voucher requires exact cents across headers, lines and posting proposal", () => {
  const base: Parameters<typeof inspectInventoryRecordFacts>[1] = {
    applicableItemCount: 1,
    documentCount: 1,
    draftDocumentIds: [],
    postedDocumentIds: [10],
    incompletePostedDocuments: [],
    orphanLedgerEntryIds: [],
    uncostedLedgerEntryIds: [],
    periodClose: { id: 20, status: "closed", voucherId: 30 },
    targetPeriodId: 99,
    postingProposal: [
      { accountCode: "6401", direction: "debit", amount: 10 },
      { accountCode: "1405", direction: "credit", amount: 10 },
    ],
    linkedVoucher: {
      id: 30, companyCode: "C01", periodId: 99, status: "posted",
      totalDebit: 10, totalCredit: 10,
      lines: [
        { accountCode: "6401", debit: 10, credit: 0 },
        { accountCode: "1405", debit: 0, credit: 10 },
      ],
    },
  };
  assert.equal(inspectInventoryRecordFacts(scope, base).status, "ready");

  const headerImbalance = {
    ...base.linkedVoucher!, totalDebit: 10.01, totalCredit: 10,
    lines: [
      { accountCode: "6401", debit: 10.01, credit: 0 },
      { accountCode: "1405", debit: 0, credit: 10 },
    ],
  };
  const headerLineMismatch = { ...base.linkedVoucher!, totalDebit: 10.01, totalCredit: 10.01 };
  const proposalMismatch = {
    ...base.linkedVoucher!, totalDebit: 10.01, totalCredit: 10.01,
    lines: [
      { accountCode: "6401", debit: 10.01, credit: 0 },
      { accountCode: "1405", debit: 0, credit: 10.01 },
    ],
  };
  for (const linkedVoucher of [headerImbalance, headerLineMismatch, proposalMismatch]) {
    const inspection = inspectInventoryRecordFacts(scope, { ...base, linkedVoucher });
    assert.equal(inspection.status, "blocked");
    assert.equal(inspection.blockers[0]?.code, "inventory_closing_voucher_mismatch");
  }
});

test("zero issue-cost period may close without fabricating a voucher", () => {
  const inspection = inspectInventoryRecordFacts(scope, {
    applicableItemCount: 1,
    documentCount: 0,
    draftDocumentIds: [],
    postedDocumentIds: [],
    incompletePostedDocuments: [],
    orphanLedgerEntryIds: [],
    uncostedLedgerEntryIds: [],
    periodClose: { id: 20, status: "closed", voucherId: null },
    targetPeriodId: 99,
    postingProposal: [],
    linkedVoucher: null,
  });
  assert.equal(inspection.status, "ready");
  assert.equal((inspection.payload as { voucherRequired: boolean }).voucherRequired, false);
});

test("company without inventory facts is explicitly not applicable", () => {
  const inspection = inspectInventoryRecordFacts(scope, {
    applicableItemCount: 0,
    documentCount: 0,
    draftDocumentIds: [],
    postedDocumentIds: [],
    incompletePostedDocuments: [],
    orphanLedgerEntryIds: [],
    uncostedLedgerEntryIds: [],
    periodClose: null,
    targetPeriodId: null,
    postingProposal: [],
    linkedVoucher: null,
  });
  assert.equal(inspection.status, "ready");
  assert.equal((inspection.payload as { applicable: boolean }).applicable, false);
});

test("reversed documents are not posted facts and their ledger entries are orphan blockers", () => {
  const integrity = classifyInventoryRecordIntegrity(
    [{ id: 70, documentNo: "ISSUE-70", status: "reversed", lines: [{ ledgerEntry: { id: 71 } }] }],
    [{ id: 71, documentLine: { document: { status: "reversed" } } }],
  );
  assert.deepEqual(integrity, {
    postedDocumentIds: [],
    incompletePostedDocuments: [],
    orphanLedgerEntryIds: [71],
  });
  const inspection = inspectInventoryRecordFacts(scope, {
    applicableItemCount: 1,
    documentCount: 1,
    draftDocumentIds: [],
    postedDocumentIds: integrity.postedDocumentIds,
    incompletePostedDocuments: integrity.incompletePostedDocuments,
    orphanLedgerEntryIds: integrity.orphanLedgerEntryIds,
    uncostedLedgerEntryIds: [],
    periodClose: { id: 72, status: "closed", voucherId: null },
    targetPeriodId: 99,
    postingProposal: [],
    linkedVoucher: null,
  });
  assert.equal(inspection.status, "blocked");
  assert.equal(inspection.blockers[0]?.code, "inventory_orphan_ledger_entry");
});

test("stocktake inspection closes every variance line instead of netting opposite differences", () => {
  const facts: Parameters<typeof inspectInventoryCountFacts>[1] = {
    expectedStockDimensions: [
      { itemId: 1, warehouseId: 1, batchId: null, onHandQuantity: 20 },
      { itemId: 2, warehouseId: 1, batchId: null, onHandQuantity: 30 },
    ],
    stocktakes: [{
      id: 40,
      stocktakeNo: "ST-202606",
      warehouseId: 1,
      status: "approved",
      lines: [
        { id: 41, itemId: 1, warehouseId: 1, batchId: null, variance: 10, linkedDocuments: [] },
        { id: 42, itemId: 2, warehouseId: 1, batchId: null, variance: -10, linkedDocuments: [] },
      ],
    }],
  };
  const unresolved = inspectInventoryCountFacts(scope, facts);
  assert.equal(unresolved.status, "pending");
  assert.deepEqual((unresolved.payload as { unresolvedLineIds: number[] }).unresolvedLineIds, [41, 42]);

  const closed = inspectInventoryCountFacts(scope, {
    ...facts,
    stocktakes: facts.stocktakes.map((stocktake) => ({
      ...stocktake,
      lines: stocktake.lines.map((line, index) => ({
        ...line,
        linkedDocuments: [{
          id: 50 + index,
          documentNo: `ADJ-${index + 1}`,
          documentType: "adjustment",
          documentDate: "2026-06-30",
          status: "posted",
          itemId: line.itemId,
          warehouseId: line.warehouseId,
          batchId: line.batchId,
          signedQuantity: line.variance,
          ledgerEntryId: 60 + index,
        }],
      })),
    })),
  });
  assert.equal(closed.status, "ready");

  const mismatch = inspectInventoryCountFacts(scope, {
    ...facts,
    stocktakes: facts.stocktakes.map((stocktake) => ({
      ...stocktake,
      lines: stocktake.lines.map((line) => ({
        ...line,
        linkedDocuments: [{
          id: 70 + line.id,
          documentNo: "BAD",
          documentType: "adjustment",
          documentDate: "2026-06-30",
          status: "posted",
          itemId: line.itemId,
          warehouseId: line.warehouseId,
          batchId: line.batchId,
          signedQuantity: 1,
          ledgerEntryId: 80 + line.id,
        }],
      })),
    })),
  });
  assert.equal(mismatch.status, "blocked");
  assert.equal(mismatch.blockers.length, 2);
});

test("stocktake differences reject receipts, issues and cross-period adjustments", () => {
  const baseLine = {
    id: 111,
    itemId: 1,
    warehouseId: 1,
    batchId: 7,
    variance: 5,
  };
  const inspection = inspectInventoryCountFacts(scope, {
    expectedStockDimensions: [{ itemId: 1, warehouseId: 1, batchId: 7, onHandQuantity: 5 }],
    stocktakes: [{
      id: 110,
      stocktakeNo: "ST-REJECT",
      warehouseId: 1,
      status: "approved",
      lines: [{
        ...baseLine,
        linkedDocuments: [
          {
            id: 112,
            documentNo: "RCPT-112",
            documentType: "receipt",
            documentDate: "2026-06-30",
            status: "posted",
            itemId: 1,
            warehouseId: 1,
            batchId: 7,
            signedQuantity: 5,
            ledgerEntryId: 212,
          },
          {
            id: 113,
            documentNo: "ISSUE-113",
            documentType: "issue",
            documentDate: "2026-06-30",
            status: "posted",
            itemId: 1,
            warehouseId: 1,
            batchId: 7,
            signedQuantity: -5,
            ledgerEntryId: 213,
          },
          {
            id: 114,
            documentNo: "ADJ-OLD",
            documentType: "adjustment",
            documentDate: "2026-05-31",
            status: "posted",
            itemId: 1,
            warehouseId: 1,
            batchId: 7,
            signedQuantity: 5,
            ledgerEntryId: 214,
          },
          {
            id: 115,
            documentNo: "ADJ-WRONG-BATCH",
            documentType: "adjustment",
            documentDate: "2026-06-30",
            status: "posted",
            itemId: 1,
            warehouseId: 1,
            batchId: 8,
            signedQuantity: 5,
            ledgerEntryId: 215,
          },
        ],
      }],
    }],
  });
  assert.equal(inspection.status, "blocked");
  const row = (inspection.payload as {
    varianceRows: Array<{
      hasWrongDocumentTypeEvidence: boolean;
      hasOutsidePeriodEvidence: boolean;
      hasDimensionMismatchEvidence: boolean;
      linkedDocuments: Array<{ documentType: string; documentDate: string; status: string }>;
    }>;
  }).varianceRows[0];
  assert.equal(row?.hasWrongDocumentTypeEvidence, true);
  assert.equal(row?.hasOutsidePeriodEvidence, true);
  assert.equal(row?.hasDimensionMismatchEvidence, true);
  assert.deepEqual(row?.linkedDocuments.map(({ documentType, documentDate, status }) => ({ documentType, documentDate, status })), [
    { documentType: "receipt", documentDate: "2026-06-30", status: "posted" },
    { documentType: "issue", documentDate: "2026-06-30", status: "posted" },
    { documentType: "adjustment", documentDate: "2026-05-31", status: "posted" },
    { documentType: "adjustment", documentDate: "2026-06-30", status: "posted" },
  ]);
});

test("one formal stocktake line does not cover every nonzero period-end stock dimension", () => {
  const inspection = inspectInventoryCountFacts(scope, {
    expectedStockDimensions: [
      { itemId: 1, warehouseId: 1, batchId: null, onHandQuantity: 5 },
      { itemId: 2, warehouseId: 1, batchId: 8, onHandQuantity: 3 },
    ],
    stocktakes: [{
      id: 90,
      stocktakeNo: "ST-PARTIAL",
      warehouseId: 1,
      status: "reviewed",
      lines: [{ id: 91, itemId: 1, warehouseId: 1, batchId: null, variance: 0, linkedDocuments: [] }],
    }],
  });
  assert.equal(inspection.status, "pending");
  assert.deepEqual((inspection.payload as { missingStockDimensions: Array<{ itemId: number; batchId: number | null }> }).missingStockDimensions, [
    { itemId: 2, warehouseId: 1, batchId: 8, onHandQuantity: 3 },
  ]);
});

test("opposite-direction documents cannot net into a closed stocktake line", () => {
  const inspection = inspectInventoryCountFacts(scope, {
    expectedStockDimensions: [{ itemId: 1, warehouseId: 1, batchId: null, onHandQuantity: 5 }],
    stocktakes: [{
      id: 100,
      stocktakeNo: "ST-100",
      warehouseId: 1,
      status: "approved",
      lines: [{
        id: 101,
        itemId: 1,
        warehouseId: 1,
        batchId: null,
        variance: 5,
        linkedDocuments: [
          {
            id: 102,
            documentNo: "A",
            documentType: "adjustment",
            documentDate: "2026-06-30",
            status: "posted",
            itemId: 1,
            warehouseId: 1,
            batchId: null,
            signedQuantity: 8,
            ledgerEntryId: 202,
          },
          {
            id: 103,
            documentNo: "B",
            documentType: "adjustment",
            documentDate: "2026-06-30",
            status: "posted",
            itemId: 1,
            warehouseId: 1,
            batchId: null,
            signedQuantity: -3,
            ledgerEntryId: 203,
          },
        ],
      }],
    }],
  });
  assert.equal(inspection.status, "blocked");
  assert.equal((inspection.payload as { varianceRows: Array<{ hasOppositeDirectionEvidence: boolean }> }).varianceRows[0]?.hasOppositeDirectionEvidence, true);
});
