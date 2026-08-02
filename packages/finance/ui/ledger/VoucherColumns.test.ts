import assert from "node:assert/strict";
import test from "node:test";

import { getGroupItemColumns, getGroupSourceTraceColumns } from "../components/VoucherItemTable";
import { getVoucherColumns, voucherRecordingSource } from "./VoucherColumns";

test("group vouchers keep only read-only summary columns", () => {
  assert.deepEqual(
    getVoucherColumns(null, new Map(), { group: true }).map((column) => column.key),
    ["voucherNo", "date", "companyCode", "period", "description", "totalDebit", "totalCredit", "expand"],
  );
  assert.equal(getVoucherColumns(null, new Map(), { group: true }).some((column) => column.label === "操作"), false);
});

test("standard voucher columns expose the recording source", () => {
  const columns = getVoucherColumns(null, new Map(), { group: false });
  assert.equal(columns.some((column) => column.key === "recordingSource" && column.label === "录入来源"), true);
  assert.equal(voucherRecordingSource({ sourceSystem: "T6", voucherTypeName: "记账凭证" }), "T6");
  assert.equal(voucherRecordingSource({ sourceSystem: "TPLUS", voucherTypeName: "记账凭证" }), "T+");
  assert.equal(voucherRecordingSource({ sourceSystem: "WORKSPACE", voucherTypeName: "合并凭证" }), "Workspace 合并");
});

test("expanded group voucher items use compact sequence and entity-only columns", () => {
  const columns = getGroupItemColumns();
  assert.deepEqual(columns.map((column) => column.key), ["seq", "sourceDate", "account", "presentationAccount", "entity", "debit", "credit"]);
  assert.equal(columns.find((column) => column.key === "seq")?.width, "xs");
  const entity = columns.find((column) => column.key === "entity");
  const account = columns.find((column) => column.key === "account");
  assert.deepEqual(account?.cell({
    id: 1,
    account: { code: "NCI", name: "少数股东权益" },
    debit: 0,
    credit: 0,
    description: null,
  }), { kind: "disclosure", label: "少数股东权益", expanded: false, emphasis: "medium" });
  assert.deepEqual(account?.cell({
    id: 2,
    account: { code: "122101", name: "其他应收款" },
    debit: 0,
    credit: 0,
    description: null,
  }), { kind: "disclosure", label: "其他应收款 · 122101", expanded: false, emphasis: "medium" });
  assert.equal(entity?.cell({
    id: 1,
    account: null,
    debit: 0,
    credit: 0,
    description: null,
    entityName: "丰华生物",
    counterpartyName: "上海悦通",
  }), "丰华生物");
});

test("group voucher audit detail exposes original voucher fields", () => {
  const columns = getGroupSourceTraceColumns();
  assert.deepEqual(
    columns.map((column) => column.key),
    ["sourceLabel", "date", "voucherNo", "account", "processing", "description", "debit", "credit"],
  );
  for (const key of ["sourceLabel", "date", "voucherNo", "processing", "debit", "credit"]) {
    const column = columns.find((item) => item.key === key);
    assert.equal(column?.width, "content");
    assert.equal(column?.wrap, "nowrap");
  }
  assert.equal(columns.find((column) => column.key === "account")?.wrap, "wrap");
  assert.equal(columns.find((column) => column.key === "description")?.wrap, "wrap");
});
