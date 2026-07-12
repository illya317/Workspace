import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAgentIdentityAnswer,
  buildAgentIdentityContext,
  isAgentIdentityQuestion,
} from "./identity-context";

test("agent identity context includes bound employee and WeCom identity without inventing fields", () => {
  const context = buildAgentIdentityContext({
    id: 17,
    username: "zhangyu",
    employeeName: "张宇凡",
    employeeId: "00123",
    wxUserId: "ZhangYuFan",
    departmentName: null,
  });

  assert.match(context, /Workspace userId: 17/);
  assert.match(context, /员工姓名: 张宇凡/);
  assert.match(context, /员工工号: 00123/);
  assert.match(context, /企业微信 userId: ZhangYuFan/);
  assert.doesNotMatch(context, /部门:/);
});

test("identity questions get a deterministic exact authenticated answer", () => {
  const user = {
    id: 17,
    username: "zhangyu",
    employeeName: "张宇凡",
    employeeId: "00123",
    wxUserId: "ZhangYuFan",
  };
  assert.equal(isAgentIdentityQuestion("你知道我是谁吗？"), true);
  assert.equal(isAgentIdentityQuestion("查一下张宇凡"), false);
  assert.equal(
    buildAgentIdentityAnswer(user),
    "你当前认证为：张宇凡，工号 00123；企业微信 userId ZhangYuFan；Workspace userId 17。",
  );
});
