import assert from "node:assert/strict";
import test from "node:test";
import { renderContractsCsv } from "./contracts";

test("contract export renders every record and escapes CSV values", () => {
  const csv = renderContractsCsv([
    {
      id: 7,
      version: 2,
      contractNo: "C-007",
      name: "服务合同,一期",
      partyA: "甲方",
      partyB: "乙方",
      shareholder: null,
      category: "服务",
      content: "第一行\n第二行",
      handlerEmployeeId: 1,
      handlerEmployeeName: "经办人",
      handlerEmployeeActive: true,
      signDate: "2026-07-01",
      endDate: "2027-06-30",
      status: "执行中",
      amount: 1200,
      executedAmount: null,
      location: "上海",
      remark: "备注",
    },
  ]);

  assert.match(csv, /^ID,版本,合同编号/);
  assert.match(csv, /"服务合同,一期"/);
  assert.match(csv, /"第一行\n第二行"/);
  assert.match(csv, /1200/);
});
