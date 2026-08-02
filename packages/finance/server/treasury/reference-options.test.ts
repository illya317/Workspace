import assert from "node:assert/strict";
import test from "node:test";

import {
  executeTreasuryReferenceOptionsCommand,
  treasuryReferenceOptionsQuerySchema,
} from "./reference-options";

test("Treasury reference queries require the scope belonging to each canonical FK", () => {
  for (const query of [
    { fkKey: "finance.treasury.lenderParty", keyword: "银行", lifecycleScope: "active" },
    { fkKey: "finance.treasury.bankAccount.financeAccount", keyword: "银行", companyCode: "C1", year: "2026" },
    { fkKey: "finance.treasury.voucherItem", keyword: "记账", companyCode: "C1", periodId: "8" },
  ]) assert.equal(treasuryReferenceOptionsQuerySchema.safeParse(query).success, true);
  assert.equal(treasuryReferenceOptionsQuerySchema.safeParse({ fkKey: "finance.treasury.bankAccount.financeAccount", keyword: "银行", year: 2026 }).success, false);
  assert.equal(treasuryReferenceOptionsQuerySchema.safeParse({ fkKey: "finance.treasury.voucherItem", keyword: "记账", companyCode: "C1" }).success, false);
  assert.equal(treasuryReferenceOptionsQuerySchema.safeParse({ fkKey: "finance.assets.category", keyword: "银行" }).success, false);
});

test("Treasury lender reference returns only standard reference item fields", async () => {
  const result = await executeTreasuryReferenceOptionsCommand({ fkKey: "finance.treasury.lenderParty", keyword: "银行" }, {
    searchOptions: async (input) => {
      assert.equal(input.fkKey, "finance.treasury.lenderParty");
      return [{ id: 7, name: "示例银行", subtitle: "机构 · ***1234", lifecycleStatus: "active" as const, secret: "must-not-leak" }];
    },
  });
  assert.deepEqual(result, { items: [{ id: 7, name: "示例银行", subtitle: "机构 · ***1234", lifecycleStatus: "active" }] });
});

test("Treasury account and voucher searches receive the explicit company and period scope", async () => {
  let accountScope = "";
  let voucherScope = "";
  const account = await executeTreasuryReferenceOptionsCommand({
    fkKey: "finance.treasury.bankAccount.financeAccount", keyword: "银行", companyCode: "C1", year: 2026,
  }, { searchOptions: async (input) => {
    accountScope = `${input.params.companyCode}:${input.params.year}`;
    return [{ id: 10, name: "银行存款", subtitle: "1002", lifecycleStatus: "active" }];
  } });
  const voucher = await executeTreasuryReferenceOptionsCommand({
    fkKey: "finance.treasury.voucherItem", keyword: "计提", companyCode: "C1", periodId: 8,
  }, { searchOptions: async (input) => {
    voucherScope = `${input.params.companyCode}:${input.params.periodId}`;
    return [{ id: 20, name: "记-001 · 分录 1", lifecycleStatus: "active" }];
  } });
  assert.equal(accountScope, "C1:2026");
  assert.equal(voucherScope, "C1:8");
  assert.deepEqual(account, { items: [{ id: 10, name: "银行存款", subtitle: "1002", lifecycleStatus: "active" }] });
  assert.deepEqual(voucher, { items: [{ id: 20, name: "记-001 · 分录 1", lifecycleStatus: "active" }] });
});
