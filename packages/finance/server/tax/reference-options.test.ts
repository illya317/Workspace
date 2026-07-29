import assert from "node:assert/strict";
import test from "node:test";

import {
  executeTaxReferenceOptionsCommand,
  taxReferenceOptionsQuerySchema,
} from "./reference-options";

test("Tax voucher reference requires its company and business-period scope", () => {
  assert.equal(taxReferenceOptionsQuerySchema.safeParse({
    fkKey: "finance.tax.accrualVoucherItem",
    keyword: "税金",
    companyCode: "C02",
    periodId: "6",
  }).success, true);
  assert.equal(taxReferenceOptionsQuerySchema.safeParse({
    fkKey: "finance.tax.paymentVoucherItem",
    keyword: "缴税",
    companyCode: "C02",
    year: "2026",
    month: "6",
  }).success, true);
  assert.equal(taxReferenceOptionsQuerySchema.safeParse({
    fkKey: "finance.tax.accrualVoucherItem",
    companyCode: "C02",
  }).success, false);
});

test("Tax reference service projects only standard remote reference fields", async () => {
  const party = await executeTaxReferenceOptionsCommand({
    fkKey: "finance.tax.authorityParty",
    keyword: "税务局",
  }, {
    searchOptions: async (input) => {
      assert.equal(input.fkKey, "finance.tax.authorityParty");
      return [{ id: 7, name: "税务局", subtitle: "机构", lifecycleStatus: "active", secret: "no" }];
    },
  });
  assert.deepEqual(party, { items: [{ id: 7, name: "税务局", subtitle: "机构" }] });

  const voucher = await executeTaxReferenceOptionsCommand({
    fkKey: "finance.tax.accrualVoucherItem",
    keyword: "2221",
    companyCode: "C02",
    periodId: 6,
  }, {
    searchOptions: async (scope) => {
      assert.deepEqual(scope, {
        fkKey: "finance.tax.accrualVoucherItem",
        keyword: "2221",
        lifecycleScope: undefined,
        params: { companyCode: "C02", periodId: "6" },
      });
      return [{ id: 101, name: "记-1 · 应交税费", subtitle: "2026-06-30 · 2221" }];
    },
  });
  assert.deepEqual(voucher, { items: [{ id: 101, name: "记-1 · 应交税费", subtitle: "2026-06-30 · 2221" }] });
});
