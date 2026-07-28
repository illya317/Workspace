import assert from "node:assert/strict";
import test from "node:test";

import { normalizeT6Vouchers } from "./t6-adapter";

function voucherRow(overrides: Record<string, unknown> = {}) {
  return {
    i_id: "line-1",
    iperiod: 6,
    isignseq: 1,
    ino_id: 67,
    inid: 1,
    csign: "记",
    dbill_date: "2026-06-30",
    ccode: "100201",
    md: 80,
    mc: 0,
    ibook: 1,
    iflag: null,
    bdelete: false,
    ...overrides,
  };
}

function normalize(rows: Record<string, unknown>[]) {
  return normalizeT6Vouchers(
    rows,
    new Map(),
    new Map([["100201", "account-1"], ["224102", "account-2"]]),
    new Map([["记", { name: "记账凭证", isAdjustment: false }]]),
  );
}

test("imports a complete posted T6 voucher when it is valid", () => {
  const vouchers = normalize([
    voucherRow(),
    voucherRow({ i_id: "line-2", inid: 2, ccode: "224102", md: 0, mc: 80 }),
  ]);

  assert.equal(vouchers.length, 1);
  assert.equal(vouchers[0]?.status, "posted");
  assert.equal(vouchers[0]?.items.length, 2);
});

test("rejects the complete T6 voucher when any source row is invalid", () => {
  const vouchers = normalize([
    voucherRow(),
    voucherRow({ i_id: "line-2", inid: 2, ccode: "224102", md: 0, mc: 80, iflag: 1 }),
  ]);

  assert.deepEqual(vouchers, []);
});

test("rejects the complete T6 voucher when any source row is deleted", () => {
  const vouchers = normalize([
    voucherRow(),
    voucherRow({ i_id: "line-2", inid: 2, ccode: "224102", md: 0, mc: 80, bdelete: true }),
  ]);

  assert.deepEqual(vouchers, []);
});
