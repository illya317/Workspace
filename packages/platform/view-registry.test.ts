import assert from "node:assert/strict";
import test from "node:test";

import { getPageViewTabs } from "./view-registry";

test("finance ledger keeps reclassification under account balances", () => {
  const tabs = getPageViewTabs("/finance/ledger");

  assert.deepEqual(tabs.find((tab) => tab.key === "vouchers")?.children, [
    { key: "company", label: "公司明细" },
    { key: "consolidation", label: "合并明细" },
  ]);
  assert.deepEqual(tabs.find((tab) => tab.key === "ledger")?.children, [
    { key: "balances", label: "账面余额" },
    { key: "reclassification", label: "重分类" },
  ]);
});

test("finance asset accounting owns its workbench views outside the ledger", () => {
  assert.equal(getPageViewTabs("/finance/ledger").some((tab) => tab.key === "depreciation"), false);
  assert.deepEqual(getPageViewTabs("/finance/assets"), [
    { key: "policies", label: "核算政策", children: [
      { key: "group", label: "集团" },
      { key: "company", label: "公司" },
    ] },
    { key: "cards", label: "资产卡片", children: undefined },
    { key: "period", label: "月度折旧摊销", children: undefined },
    { key: "adjustments", label: "减值与处置", children: undefined },
  ]);
});

test("finance treasury and tax expose independent stable L2 view contracts", () => {
  assert.deepEqual(getPageViewTabs("/finance/treasury"), [
    { key: "bank-accounts", label: "银行账户", children: undefined },
    { key: "bank-reconciliation", label: "银行对账", children: undefined },
    { key: "loans", label: "借款", children: undefined },
    { key: "interest", label: "利息", children: undefined },
  ]);
  assert.deepEqual(getPageViewTabs("/finance/tax"), [
    { key: "accrual", label: "税费计提", children: undefined },
    { key: "filing-payment", label: "申报与缴纳", children: undefined },
    { key: "reconciliation-evidence", label: "税务勾稽与证据", children: undefined },
  ]);
});
