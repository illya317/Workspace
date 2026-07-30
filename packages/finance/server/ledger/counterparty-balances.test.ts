import assert from "node:assert/strict";
import test from "node:test";
import type { FinanceCounterpartyBalanceRow } from "../../types/ledger";
import { paginateCounterpartyBalanceRows } from "./counterparty-balances";

function row(id: string, amount: number): FinanceCounterpartyBalanceRow {
  return {
    id,
    counterpartyCode: "SAME",
    counterpartyName: "同名关联方",
    counterpartyShortName: null,
    counterpartyType: "supplier",
    counterpartyObjectKind: "supplier",
    identityMatched: true,
    relatedPartyType: "group",
    accountCode: "2202",
    accountName: "应付账款",
    openingDebit: 0,
    openingCredit: 0,
    currentDebit: 0,
    currentCredit: amount,
    closingDebit: 0,
    closingCredit: amount,
    sourceBasis: "erpMonthly",
  };
}

test("counterparty pagination sorts before slicing so pages neither repeat nor omit rows", () => {
  const rows = [row("5", 5), row("2", 2), row("4", 4), row("1", 1), row("3", 3)];
  const pages = [1, 2, 3].map((page) => paginateCounterpartyBalanceRows(rows, page, 2));
  const permutedPages = [1, 2, 3].map((page) => paginateCounterpartyBalanceRows([...rows].reverse(), page, 2));
  const ids = pages.flatMap((page) => page.data.map((item) => item.id));

  assert.deepEqual(ids, ["1", "2", "3", "4", "5"]);
  assert.equal(new Set(ids).size, rows.length);
  assert.deepEqual(permutedPages.map((page) => page.data), pages.map((page) => page.data));
  assert.equal(pages.every((page) => page.total === 5 && page.totalPages === 3), true);
});
