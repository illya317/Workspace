import assert from "node:assert/strict";
import test from "node:test";

import { financeAccountReferenceField, voucherItemReferenceField } from "./treasury-reference-fields";

test("Treasury finance-account reference carries the selected company and fiscal year", () => {
  const field = financeAccountReferenceField({
    key: "accountId", label: "银行科目", value: 12, displayValue: "银行存款",
    companyCode: "C1", year: 2026, readOnly: true, onChange: () => undefined,
  });
  assert.equal(field.value, "12");
  assert.equal(field.displayValue, "银行存款");
  assert.equal(field.readOnly, true);
  assert.deepEqual(field.spec.options, {
    source: "remote", fkKey: "finance.treasury.bankAccount.financeAccount",
    endpoint: "/api/modules/finance/treasury/reference-options", returnField: "id",
    lifecycleScope: "active", queryParams: { companyCode: "C1", year: 2026 },
  });
});

test("Treasury voucher reference carries both company and accounting period", () => {
  const field = voucherItemReferenceField({
    key: "voucherItemId", label: "凭证分录", value: 21, displayValue: "记-001 · 分录 1",
    companyCode: "C1", periodId: 8, required: true, onChange: () => undefined,
  });
  assert.equal(field.value, "21");
  assert.equal(field.displayValue, "记-001 · 分录 1");
  assert.deepEqual(field.spec.options, {
    source: "remote", fkKey: "finance.treasury.voucherItem",
    endpoint: "/api/modules/finance/treasury/reference-options", returnField: "id",
    lifecycleScope: "active", queryParams: { companyCode: "C1", periodId: 8 },
  });
});
