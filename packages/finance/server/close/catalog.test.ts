import assert from "node:assert/strict";
import test from "node:test";
import { FINANCE_CLOSE_TASK_CATALOG } from "./catalog";

const labels = ["存货记录", "盘点差异复核入账", "银行回单收集", "银行对账及余额调节", "借款增减及利息计提", "员工报销入账", "工资社保奖金公积金计提", "合同履约与研发费用评估", "资产及长期待摊增减", "折旧摊销", "资产存货暂估", "费用成本预提", "预收账款审核入账", "其他应收审核入账", "资产减值", "应付预付及其他应付", "合同执行检查", "税金计提", "汇兑及月损益结转", "科目使用检查", "单体财务报表", "合并层面科目/准则调整", "关联方清单与对账", "非常规交易及或有事项", "合并报表", "现金流量/权益变动表", "关账流程复核"];

test("close catalog is stable, complete and tenant agnostic", () => {
  assert.equal(FINANCE_CLOSE_TASK_CATALOG.length, 27);
  assert.deepEqual(FINANCE_CLOSE_TASK_CATALOG.map((item) => item.label), labels);
  assert.equal(new Set(FINANCE_CLOSE_TASK_CATALOG.map((item) => item.taskKey)).size, 27);
  assert.equal(new Set(FINANCE_CLOSE_TASK_CATALOG.map((item) => item.contributorKey)).size, 27);
  assert.equal(FINANCE_CLOSE_TASK_CATALOG.some((item) => item.contributorKey.includes("manual")), false);
  assert.deepEqual(FINANCE_CLOSE_TASK_CATALOG.map((item) => item.sequence), Array.from({ length: 27 }, (_, index) => index + 1));
  assert.deepEqual(FINANCE_CLOSE_TASK_CATALOG.slice(0, 2).map((item) => item.contributorKey), [
    "inventory.operations.records",
    "inventory.operations.count-differences",
  ]);
  assert.doesNotMatch(JSON.stringify(FINANCE_CLOSE_TASK_CATALOG), /sourceFile|contact|联系人|\.xlsx/i);
});
