import type {
  InventoryClosingBlocker,
  InventoryClosingContract,
  InventoryClosingInspection,
  InventoryClosingScope,
} from "@workspace/platform/contracts/inventory-closing";
import { prisma } from "@workspace/platform/server/prisma";
import { inventoryAccountingAdapter } from "./accounting-adapter";

export type InventoryRecordFacts = {
  applicableItemCount: number;
  documentCount: number;
  draftDocumentIds: number[];
  postedDocumentIds: number[];
  incompletePostedDocuments: Array<{ id: number; documentNo: string; lineCount: number; ledgerEntryCount: number }>;
  orphanLedgerEntryIds: number[];
  uncostedLedgerEntryIds: number[];
  periodClose: { id: number; status: string; voucherId: number | null } | null;
  targetPeriodId: number | null;
  postingProposal: Array<{ accountCode: string; direction: "debit" | "credit"; amount: number }>;
  linkedVoucher: {
    id: number;
    companyCode: string;
    periodId: number;
    status: string;
    totalDebit: number;
    totalCredit: number;
    lines: Array<{ accountCode: string; debit: number; credit: number }>;
  } | null;
};

export type InventoryCountFacts = {
  expectedStockDimensions: Array<{
    itemId: number;
    warehouseId: number;
    batchId: number | null;
    onHandQuantity: number;
  }>;
  stocktakes: Array<{
    id: number;
    stocktakeNo: string;
    warehouseId: number;
    status: string;
    lines: Array<{
      id: number;
      itemId: number;
      warehouseId: number;
      batchId: number | null;
      variance: number;
      linkedDocuments: Array<{
        id: number;
        documentNo: string;
        documentType: string;
        documentDate: string;
        status: string;
        itemId: number;
        warehouseId: number;
        batchId: number | null;
        signedQuantity: number | null;
        ledgerEntryId: number | null;
      }>;
    }>;
  }>;
};

const unique = (values: string[]) => [...new Set(values)].sort();
const periodLink = (scope: InventoryClosingScope, view: string) => `/inventory/operations?view=${view}&companyCode=${encodeURIComponent(scope.companyCode)}&year=${scope.year}&month=${scope.month}`;
const roundQuantity = (value: number) => Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
const moneyInCents = (value: number) => Number.isFinite(value) ? Math.round((value + Number.EPSILON) * 100) : Number.NaN;
const roundMoney = (value: number) => moneyInCents(value) / 100;
const moneyMatches = (left: number, right: number) => moneyInCents(left) === moneyInCents(right);

function inspection(
  status: InventoryClosingInspection["status"],
  inspectionVersion: string,
  deepLink: string,
  payload: unknown,
  blockers: InventoryClosingBlocker[] = [],
  evidenceRefs: string[] = [],
  voucherRefs: string[] = [],
): InventoryClosingInspection {
  return {
    status,
    inspectionVersion,
    blockers,
    evidenceRefs: unique(evidenceRefs),
    voucherRefs: unique(voucherRefs),
    deepLink,
    payload,
  };
}

export function inspectInventoryRecordFacts(
  scope: InventoryClosingScope,
  inputFacts: InventoryRecordFacts,
): InventoryClosingInspection {
  const facts = canonicalInventoryRecordFacts(inputFacts);
  const deepLink = periodLink(scope, "closing");
  const applicable = facts.applicableItemCount > 0 || facts.documentCount > 0;
  const blockers: InventoryClosingBlocker[] = [
    ...facts.incompletePostedDocuments.map((row) => ({
      code: "inventory_posted_document_ledger_incomplete",
      message: `已过账存货单据 ${row.documentNo} 的 ${row.lineCount} 行仅形成 ${row.ledgerEntryCount} 条流水`,
      deepLink,
    })),
    ...facts.orphanLedgerEntryIds.map((id) => ({
      code: "inventory_orphan_ledger_entry",
      message: `存货流水 ${id} 未关联有效的已过账单据行`,
      deepLink,
    })),
    ...facts.uncostedLedgerEntryIds.map((id) => ({
      code: "inventory_ledger_cost_missing",
      message: `存货流水 ${id} 缺少计价成本`,
      deepLink,
    })),
  ];
  const voucherRequired = facts.postingProposal.length > 0;
  const voucherMatches = closingVoucherMatches(scope, facts);
  if (facts.periodClose?.voucherId && !voucherMatches) {
    blockers.push({
      code: "inventory_closing_voucher_mismatch",
      message: "存货结转凭证不存在、未过账，或与本期计价建议不一致",
      deepLink,
    });
  }
  const pendingReasons = [
    ...(facts.draftDocumentIds.length ? ["draft_documents"] : []),
    ...(!facts.periodClose || facts.periodClose.status !== "closed" ? ["period_not_closed"] : []),
    ...(facts.postingProposal.length > 0 && !facts.periodClose?.voucherId ? ["closing_voucher_missing"] : []),
  ];
  const ready = !applicable || (pendingReasons.length === 0 && voucherMatches);
  const payload = {
    applicable,
    applicableItemCount: facts.applicableItemCount,
    documentCount: facts.documentCount,
    draftDocumentIds: [...facts.draftDocumentIds].sort((a, b) => a - b),
    postedDocumentIds: [...facts.postedDocumentIds].sort((a, b) => a - b),
    incompletePostedDocuments: facts.incompletePostedDocuments,
    orphanLedgerEntryIds: [...facts.orphanLedgerEntryIds].sort((a, b) => a - b),
    uncostedLedgerEntryIds: [...facts.uncostedLedgerEntryIds].sort((a, b) => a - b),
    periodClose: facts.periodClose,
    targetPeriodId: facts.targetPeriodId,
    postingProposal: facts.postingProposal,
    linkedVoucher: facts.linkedVoucher ? {
      id: facts.linkedVoucher.id,
      companyCode: facts.linkedVoucher.companyCode,
      periodId: facts.linkedVoucher.periodId,
      status: facts.linkedVoucher.status,
      totalDebit: roundMoney(facts.linkedVoucher.totalDebit),
      totalCredit: roundMoney(facts.linkedVoucher.totalCredit),
      items: [...facts.linkedVoucher.lines]
        .map((line) => ({
          accountCode: line.accountCode,
          debit: roundMoney(line.debit),
          credit: roundMoney(line.credit),
        }))
        .sort((left, right) => left.accountCode.localeCompare(right.accountCode)
          || left.debit - right.debit
          || left.credit - right.credit),
    } : null,
    voucherRequired,
    voucherMatches,
    pendingReasons,
  };
  return inspection(
    blockers.length ? "blocked" : ready ? "ready" : "pending",
    "inventory-records-close-v2",
    deepLink,
    payload,
    blockers,
    [
      ...facts.postedDocumentIds.map((id) => `inventory-document:${id}`),
      ...(facts.periodClose ? [`inventory-period-close:${facts.periodClose.id}`] : []),
    ],
    facts.periodClose?.voucherId ? [`finance-voucher:${facts.periodClose.voucherId}`] : [],
  );
}

export function inspectInventoryCountFacts(
  scope: InventoryClosingScope,
  inputFacts: InventoryCountFacts,
): InventoryClosingInspection {
  const facts = canonicalInventoryCountFacts(inputFacts);
  const deepLink = periodLink(scope, "stocktakes");
  const startDate = `${scope.year}-${String(scope.month).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(scope.year, scope.month, 0)).toISOString().slice(0, 10);
  const formalStocktakes = facts.stocktakes.filter((row) => ["approved", "reviewed", "closed"].includes(row.status));
  const dimensionKey = (row: { itemId: number; warehouseId: number; batchId: number | null }) => `${row.itemId}:${row.warehouseId}:${row.batchId ?? "none"}`;
  const formalLineKeys = new Set(formalStocktakes.flatMap((row) => row.lines.map(dimensionKey)));
  const expectedStockDimensions = [...facts.expectedStockDimensions]
    .filter((row) => Math.abs(row.onHandQuantity) > 0.000001)
    .sort((left, right) => dimensionKey(left).localeCompare(dimensionKey(right)));
  const missingStockDimensions = expectedStockDimensions.filter((row) => !formalLineKeys.has(dimensionKey(row)));
  const draftStocktakeIds = facts.stocktakes.filter((row) => !["approved", "reviewed", "closed"].includes(row.status)).map((row) => row.id).sort((a, b) => a - b);
  const varianceRows = formalStocktakes.flatMap((stocktake) => stocktake.lines
    .filter((line) => Math.abs(line.variance) > 0.000001)
    .map((line) => {
      const dimensionMatches = (document: typeof line.linkedDocuments[number]) => document.itemId === line.itemId
        && document.warehouseId === line.warehouseId
        && document.batchId === line.batchId;
      const postedAdjustmentLinks = line.linkedDocuments.filter((document) => document.documentType === "adjustment"
        && document.documentDate >= startDate
        && document.documentDate <= endDate
        && document.status === "posted"
        && document.ledgerEntryId != null
        && document.signedQuantity != null
        && dimensionMatches(document));
      const acceptedLinks = postedAdjustmentLinks.filter((document) => Math.sign(Number(document.signedQuantity)) === Math.sign(line.variance));
      const adjustedQuantity = roundQuantity(acceptedLinks.reduce((sum, document) => sum + Number(document.signedQuantity), 0));
      const hasOppositeDirectionEvidence = postedAdjustmentLinks.some((document) => Math.sign(Number(document.signedQuantity)) !== Math.sign(line.variance));
      const hasWrongDocumentTypeEvidence = line.linkedDocuments.some((document) => document.documentType !== "adjustment");
      const hasOutsidePeriodEvidence = line.linkedDocuments.some((document) => document.documentDate < startDate || document.documentDate > endDate);
      const hasDimensionMismatchEvidence = line.linkedDocuments.some((document) => !dimensionMatches(document));
      const hasUnpostedEvidence = line.linkedDocuments.some((document) => document.status !== "posted"
        || document.ledgerEntryId == null
        || document.signedQuantity == null);
      const hasInvalidEvidence = hasWrongDocumentTypeEvidence
        || hasOutsidePeriodEvidence
        || hasDimensionMismatchEvidence
        || hasUnpostedEvidence
        || hasOppositeDirectionEvidence;
      return {
        stocktakeId: stocktake.id,
        stocktakeNo: stocktake.stocktakeNo,
        lineId: line.id,
        variance: roundQuantity(line.variance),
        adjustedQuantity,
        linkedDocuments: [...line.linkedDocuments]
          .map((document) => ({
            id: document.id,
            documentNo: document.documentNo,
            documentType: document.documentType,
            documentDate: document.documentDate,
            status: document.status,
            itemId: document.itemId,
            warehouseId: document.warehouseId,
            batchId: document.batchId,
            signedQuantity: document.signedQuantity == null ? null : roundQuantity(document.signedQuantity),
            ledgerEntryId: document.ledgerEntryId,
          }))
          .sort((left, right) => left.id - right.id
            || left.itemId - right.itemId
            || left.warehouseId - right.warehouseId
            || (left.batchId ?? -1) - (right.batchId ?? -1)),
        linkedDocumentIds: line.linkedDocuments.map((row) => row.id).sort((a, b) => a - b),
        linkedLedgerEntryIds: line.linkedDocuments.flatMap((row) => row.ledgerEntryId ?? []).sort((a, b) => a - b),
        acceptedAdjustmentDocumentIds: acceptedLinks.map((row) => row.id).sort((a, b) => a - b),
        hasUnpostedEvidence,
        hasWrongDocumentTypeEvidence,
        hasOutsidePeriodEvidence,
        hasDimensionMismatchEvidence,
        hasOppositeDirectionEvidence,
        closed: acceptedLinks.length > 0 && !hasInvalidEvidence && Math.abs(adjustedQuantity - line.variance) <= 0.000001,
      };
    }));
  const mismatchedRows = varianceRows.filter((row) => row.linkedDocumentIds.length > 0 && !row.closed);
  const blockers: InventoryClosingBlocker[] = mismatchedRows.map((row) => ({
    code: "inventory_stocktake_adjustment_mismatch",
    message: `盘点单 ${row.stocktakeNo} 明细 ${row.lineId} 差异 ${row.variance}，本期合规调整数量为 ${row.adjustedQuantity}`,
    deepLink,
  }));
  const unresolvedLineIds = varianceRows.filter((row) => !row.closed).map((row) => row.lineId).sort((a, b) => a - b);
  const applicable = expectedStockDimensions.length > 0 || facts.stocktakes.length > 0;
  const pendingReasons = [
    ...(missingStockDimensions.length ? ["formal_stocktake_coverage_missing"] : []),
    ...(draftStocktakeIds.length ? ["draft_stocktakes"] : []),
    ...(unresolvedLineIds.length ? ["variance_adjustments_incomplete"] : []),
  ];
  const ready = !applicable || (formalStocktakes.length > 0 && pendingReasons.length === 0);
  const payload = {
    applicable,
    expectedStockDimensions,
    formalStocktakeIds: formalStocktakes.map((row) => row.id).sort((a, b) => a - b),
    missingStockDimensions,
    draftStocktakeIds,
    varianceRows,
    unresolvedLineIds,
    pendingReasons,
  };
  return inspection(
    blockers.length ? "blocked" : ready ? "ready" : "pending",
    "inventory-count-differences-close-v2",
    deepLink,
    payload,
    blockers,
    [
      ...formalStocktakes.map((row) => `inventory-stocktake:${row.id}`),
      ...formalStocktakes.flatMap((row) => row.lines.map((line) => `inventory-stocktake-line:${line.id}`)),
      ...varianceRows.flatMap((row) => row.linkedDocumentIds.map((id) => `inventory-document:${id}`)),
      ...varianceRows.flatMap((row) => row.linkedLedgerEntryIds.map((id) => `inventory-ledger-entry:${id}`)),
    ],
  );
}

function closingVoucherMatches(scope: InventoryClosingScope, facts: InventoryRecordFacts) {
  const linkedVoucherId = facts.periodClose?.voucherId;
  if (!linkedVoucherId) return facts.postingProposal.length === 0;
  const voucher = facts.linkedVoucher;
  if (!voucher
    || voucher.id !== linkedVoucherId
    || voucher.companyCode !== scope.companyCode
    || facts.targetPeriodId == null
    || voucher.periodId !== facts.targetPeriodId
    || voucher.status !== "posted") return false;
  if (!moneyMatches(voucher.totalDebit, voucher.totalCredit)) return false;
  const lineTotalDebit = roundMoney(voucher.lines.reduce((sum, line) => sum + line.debit, 0));
  const lineTotalCredit = roundMoney(voucher.lines.reduce((sum, line) => sum + line.credit, 0));
  if (!moneyMatches(voucher.totalDebit, lineTotalDebit) || !moneyMatches(voucher.totalCredit, lineTotalCredit)) return false;
  const actual = aggregateVoucherLines(voucher.lines);
  if (!actual) return false;
  const expected = aggregatePostingProposal(facts.postingProposal);
  if (actual.size !== expected.size) return false;
  return [...expected].every(([key, amount]) => actual.has(key) && moneyMatches(actual.get(key) ?? 0, amount));
}

function aggregateVoucherLines(lines: NonNullable<InventoryRecordFacts["linkedVoucher"]>["lines"]) {
  const amounts = new Map<string, number>();
  for (const line of lines) {
    const debit = roundMoney(line.debit);
    const credit = roundMoney(line.credit);
    if (!Number.isFinite(debit)
      || !Number.isFinite(credit)
      || debit < 0
      || credit < 0
      || (debit > 0) === (credit > 0)) return null;
    const direction = debit > 0 ? "debit" : "credit";
    const key = `${line.accountCode}:${direction}`;
    amounts.set(key, roundMoney((amounts.get(key) ?? 0) + (direction === "debit" ? debit : credit)));
  }
  return amounts;
}

function aggregatePostingProposal(lines: InventoryRecordFacts["postingProposal"]) {
  const amounts = new Map<string, number>();
  for (const line of lines) {
    const key = `${line.accountCode}:${line.direction}`;
    amounts.set(key, roundMoney((amounts.get(key) ?? 0) + line.amount));
  }
  return amounts;
}

function canonicalInventoryRecordFacts(facts: InventoryRecordFacts): InventoryRecordFacts {
  return {
    ...facts,
    draftDocumentIds: [...facts.draftDocumentIds].sort((left, right) => left - right),
    postedDocumentIds: [...facts.postedDocumentIds].sort((left, right) => left - right),
    incompletePostedDocuments: [...facts.incompletePostedDocuments].sort((left, right) => left.id - right.id
      || left.documentNo.localeCompare(right.documentNo)
      || left.lineCount - right.lineCount
      || left.ledgerEntryCount - right.ledgerEntryCount),
    orphanLedgerEntryIds: [...facts.orphanLedgerEntryIds].sort((left, right) => left - right),
    uncostedLedgerEntryIds: [...facts.uncostedLedgerEntryIds].sort((left, right) => left - right),
    postingProposal: [...facts.postingProposal].sort((left, right) => left.accountCode.localeCompare(right.accountCode)
      || left.direction.localeCompare(right.direction)
      || left.amount - right.amount),
    linkedVoucher: facts.linkedVoucher ? {
      ...facts.linkedVoucher,
      lines: [...facts.linkedVoucher.lines].sort((left, right) => left.accountCode.localeCompare(right.accountCode)
        || left.debit - right.debit
        || left.credit - right.credit),
    } : null,
  };
}

function canonicalInventoryCountFacts(facts: InventoryCountFacts): InventoryCountFacts {
  const dimensionOrder = (
    left: { itemId: number; warehouseId: number; batchId: number | null },
    right: { itemId: number; warehouseId: number; batchId: number | null },
  ) => left.itemId - right.itemId
    || left.warehouseId - right.warehouseId
    || (left.batchId ?? -1) - (right.batchId ?? -1);
  return {
    expectedStockDimensions: [...facts.expectedStockDimensions].sort(dimensionOrder),
    stocktakes: facts.stocktakes.map((stocktake) => ({
      ...stocktake,
      lines: stocktake.lines.map((line) => ({
        ...line,
        linkedDocuments: [...line.linkedDocuments].sort((left, right) => left.id - right.id
          || left.documentNo.localeCompare(right.documentNo)
          || dimensionOrder(left, right)
          || (left.ledgerEntryId ?? -1) - (right.ledgerEntryId ?? -1)),
      })).sort((left, right) => left.id - right.id || dimensionOrder(left, right)),
    })).sort((left, right) => left.id - right.id || left.stocktakeNo.localeCompare(right.stocktakeNo)),
  };
}

export function classifyInventoryRecordIntegrity(
  documents: Array<{
    id: number;
    documentNo: string;
    status: string;
    lines: Array<{ ledgerEntry: { id: number } | null }>;
  }>,
  ledgerEntries: Array<{ id: number; documentLine: { document: { status: string } } }>,
) {
  return {
    postedDocumentIds: documents.filter((row) => row.status === "posted").map((row) => row.id),
    incompletePostedDocuments: documents.filter((row) => row.status === "posted" && row.lines.some((line) => !line.ledgerEntry)).map((row) => ({
      id: row.id,
      documentNo: row.documentNo,
      lineCount: row.lines.length,
      ledgerEntryCount: row.lines.filter((line) => line.ledgerEntry).length,
    })),
    orphanLedgerEntryIds: ledgerEntries.filter((row) => row.documentLine.document.status !== "posted").map((row) => row.id),
  };
}

async function loadInventoryRecordFacts(scope: InventoryClosingScope): Promise<InventoryRecordFacts> {
  const startDate = `${scope.year}-${String(scope.month).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(scope.year, scope.month, 0)).toISOString().slice(0, 10);
  const [applicableItemCount, documents, ledgerEntries, periodClose, targetPeriod, postingProposal] = await Promise.all([
    prisma.inventoryItem.count({ where: { companyCode: scope.companyCode, status: "active" } }),
    prisma.inventoryDocument.findMany({
      where: { companyCode: scope.companyCode, documentDate: { gte: startDate, lte: endDate } },
      select: { id: true, documentNo: true, status: true, lines: { select: { id: true, ledgerEntry: { select: { id: true } } } } },
    }),
    prisma.inventoryLedgerEntry.findMany({
      where: { companyCode: scope.companyCode, movementDate: { gte: startDate, lte: endDate } },
      select: { id: true, unitCost: true, documentLine: { select: { document: { select: { status: true } } } } },
    }),
    prisma.inventoryPeriodClose.findUnique({ where: { companyCode_year_month: scope }, select: { id: true, status: true, voucherId: true } }),
    prisma.financePeriod.findUnique({ where: { companyCode_year_month: scope }, select: { id: true } }),
    inventoryAccountingAdapter.getPostingProposal(scope),
  ]);
  const linkedVoucher = periodClose?.voucherId ? await prisma.financeVoucher.findUnique({
    where: { id: periodClose.voucherId },
    select: {
      id: true,
      companyCode: true,
      periodId: true,
      status: true,
      totalDebit: true,
      totalCredit: true,
      items: { select: { debit: true, credit: true, account: { select: { code: true } } } },
    },
  }) : null;
  const integrity = classifyInventoryRecordIntegrity(documents, ledgerEntries);
  return {
    applicableItemCount,
    documentCount: documents.length,
    draftDocumentIds: documents.filter((row) => row.status === "draft").map((row) => row.id),
    postedDocumentIds: integrity.postedDocumentIds,
    incompletePostedDocuments: integrity.incompletePostedDocuments,
    orphanLedgerEntryIds: integrity.orphanLedgerEntryIds,
    uncostedLedgerEntryIds: ledgerEntries.filter((row) => row.unitCost == null).map((row) => row.id),
    periodClose,
    targetPeriodId: targetPeriod?.id ?? null,
    postingProposal,
    linkedVoucher: linkedVoucher ? {
      id: linkedVoucher.id,
      companyCode: linkedVoucher.companyCode,
      periodId: linkedVoucher.periodId,
      status: linkedVoucher.status,
      totalDebit: linkedVoucher.totalDebit,
      totalCredit: linkedVoucher.totalCredit,
      lines: linkedVoucher.items.map((line) => ({ accountCode: line.account.code, debit: Number(line.debit), credit: Number(line.credit) })),
    } : null,
  };
}

async function loadInventoryCountFacts(scope: InventoryClosingScope): Promise<InventoryCountFacts> {
  const startDate = `${scope.year}-${String(scope.month).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(scope.year, scope.month, 0)).toISOString().slice(0, 10);
  const [stockDimensions, stocktakes] = await Promise.all([
    prisma.inventoryLedgerEntry.groupBy({
      by: ["itemId", "warehouseId", "batchId"],
      where: { companyCode: scope.companyCode, movementDate: { lte: endDate } },
      _sum: { signedQuantity: true },
    }),
    prisma.inventoryStocktake.findMany({
      where: { companyCode: scope.companyCode, stocktakeDate: { gte: startDate, lte: endDate } },
      select: {
        id: true,
        stocktakeNo: true,
        warehouseId: true,
        status: true,
        lines: { select: { id: true, itemId: true, warehouseId: true, batchId: true, bookQuantity: true, actualQuantity: true } },
      },
    }),
  ]);
  const stocktakeNos = stocktakes.map((row) => row.stocktakeNo);
  const linkedDocuments = stocktakeNos.length ? await prisma.inventoryDocument.findMany({
    where: {
      companyCode: scope.companyCode,
      referenceNo: { in: stocktakeNos },
      documentType: { in: ["adjustment", "receipt", "issue"] },
    },
    select: {
      id: true,
      documentNo: true,
      documentType: true,
      documentDate: true,
      referenceNo: true,
      status: true,
      lines: { select: { itemId: true, warehouseId: true, batchId: true, ledgerEntry: { select: { id: true, signedQuantity: true } } } },
    },
  }) : [];
  return {
    expectedStockDimensions: stockDimensions.map((row) => ({
      itemId: row.itemId,
      warehouseId: row.warehouseId,
      batchId: row.batchId,
      onHandQuantity: roundQuantity(Number(row._sum.signedQuantity ?? 0)),
    })).filter((row) => Math.abs(row.onHandQuantity) > 0.000001),
    stocktakes: stocktakes.map((stocktake) => ({
      id: stocktake.id,
      stocktakeNo: stocktake.stocktakeNo,
      warehouseId: stocktake.warehouseId,
      status: stocktake.status,
      lines: stocktake.lines.map((line) => ({
        id: line.id,
        itemId: line.itemId,
        warehouseId: line.warehouseId,
        batchId: line.batchId,
        variance: roundQuantity(Number(line.actualQuantity) - Number(line.bookQuantity)),
        linkedDocuments: linkedDocuments.flatMap((document) => document.referenceNo === stocktake.stocktakeNo
          ? document.lines.filter((documentLine) => documentLine.itemId === line.itemId
            && documentLine.warehouseId === line.warehouseId
            && documentLine.batchId === line.batchId).map((documentLine) => ({
              id: document.id,
              documentNo: document.documentNo,
              documentType: document.documentType,
              documentDate: document.documentDate,
              status: document.status,
              itemId: documentLine.itemId,
              warehouseId: documentLine.warehouseId,
              batchId: documentLine.batchId,
              signedQuantity: documentLine.ledgerEntry == null ? null : Number(documentLine.ledgerEntry.signedQuantity),
              ledgerEntryId: documentLine.ledgerEntry?.id ?? null,
            }))
          : []),
      })),
    })),
  };
}

export const inventoryClosingAdapter: InventoryClosingContract = {
  async inspectPeriodRecords(scope) {
    return inspectInventoryRecordFacts(scope, await loadInventoryRecordFacts(scope));
  },
  async inspectPeriodCountDifferences(scope) {
    return inspectInventoryCountFacts(scope, await loadInventoryCountFacts(scope));
  },
};
