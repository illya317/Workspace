import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";

import type { Voucher } from "@workspace/finance/types";
import { buildGroupVoucherWorkbook } from "./group-voucher-export";
import { buildLedgerWorkbook } from "./ledger-workbook";

const voucher: Voucher = {
  id: 10,
  voucherNo: "2026-06-合-0010",
  date: "2026-06-30",
  periodId: 28,
  period: { id: 28, year: 2026, month: 6 },
  description: "丰华生物 ↔ 上海悦通",
  totalDebit: 42000,
  totalCredit: 42000,
  status: "posted",
  companyCode: null,
  voucherKind: "group",
  items: [{
    id: 101,
    accountId: 1,
    account: { id: 1, code: "122101", name: "其他应收款-单位" },
    presentationAccount: { id: 2, code: "224101", name: "其他应付款-单位" },
    debit: 0,
    credit: 42000,
    description: "内部往来抵销",
    sortOrder: 1,
    entityName: "丰华生物",
    counterpartyName: "上海悦通",
    sourceKind: "auxiliaryBalance",
    sourceTrace: [
      {
        key: "opening",
        sourceType: "openingBalance",
        sourceLabel: "期初余额（小计）",
        date: "2026-06-01",
        voucherNo: null,
        accountCode: "122101",
        accountName: "其他应收款-单位",
        description: "辅助核算期初余额",
        debit: 42000,
        credit: 0,
      },
      {
        key: "voucher",
        sourceType: "historicalVoucher",
        sourceLabel: "期初关联凭证",
        date: "2020-06-23",
        voucherNo: "2020-06-记-0022",
        accountCode: "122101",
        accountName: "其他应收款-单位",
        description: "付上海悦通往来款",
        debit: 15000,
        credit: 0,
        reclassifiedToAccountCode: "224101",
        reclassificationStatus: "approved",
      },
    ],
    sourceReclassification: {
      sourceAccountCode: "122101",
      sourceAccountName: "其他应收款-单位",
      targetAccountCode: "224101",
      targetAccountName: "其他应付款-单位",
      basis: "counterparty_gross",
      sourceType: "auxiliary_balance",
      status: "approved",
    },
    sourceBalanceCheck: {
      openingNet: 42000,
      currentMovementNet: 0,
      closingNet: 42000,
      openingUntracedNet: 0,
      currentUntracedNet: 0,
    },
  }],
};

test("group voucher export keeps summary compact and expands detail to audit rows", () => {
  const summary = buildGroupVoucherWorkbook([voucher], "summary");
  assert.equal(summary.sheetName, "合并汇总");
  assert.equal(summary.rows.length, 1);

  const detail = buildGroupVoucherWorkbook([voucher], "detail");
  assert.equal(detail.sheetName, "合并审计明细");
  assert.equal(detail.rows.length, 2);
  const headers = detail.columns.map((column) => column.header);
  const originalVoucherIndex = headers.indexOf("原始凭证号");
  const reclassificationIndex = headers.indexOf("重分类路径");
  const processingIndex = headers.indexOf("处理");
  assert.equal(detail.rows[1]?.[originalVoucherIndex], "2020-06-记-0022");
  assert.equal(detail.rows[1]?.[processingIndex], "重分类 → 224101");
  assert.match(String(detail.rows[1]?.[reclassificationIndex]), /122101.*224101/);

  const workbook = XLSX.read(buildLedgerWorkbook(detail), { type: "buffer", cellNF: true });
  assert.deepEqual(workbook.SheetNames, ["合并审计明细"]);
  assert.equal(workbook.Sheets["合并审计明细"]?.Y3?.z, "#,##0.00;[Red]-#,##0.00;0");
});

test("detail export retains a consolidation line without trace rows", () => {
  const withoutTrace: Voucher = {
    ...voucher,
    items: [{ ...voucher.items[0]!, sourceTrace: [] }],
  };
  const detail = buildGroupVoucherWorkbook([withoutTrace], "detail");
  const sourceIndex = detail.columns.findIndex((column) => column.header === "审计来源");
  assert.equal(detail.rows.length, 1);
  assert.equal(detail.rows[0]?.[sourceIndex], "无可穿透来源");
});
