import assert from "node:assert/strict";
import test from "node:test";

import { getGroupItemColumns } from "../components/VoucherItemTable";
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
  assert.equal(voucherRecordingSource({ sourceSystem: "WORKSPACE", voucherTypeName: "补录凭证" }), "Workspace 补录");
});

test("expanded group voucher items omit duplicate description and source evidence", () => {
  assert.deepEqual(
    getGroupItemColumns().map((column) => column.key),
    ["seq", "account", "entity", "counterparty", "debit", "credit"],
  );
});
