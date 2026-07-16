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

test("Workspace Agent identity keeps requester, virtual employee and runtime roles separate", () => {
  const requester = { id: 17, username: "zhangyu", employeeName: "张宇凡", employeeId: "00123" };
  const actor = { id: 32, username: "agent-workspace-assistant", employeeName: "Workspace 提案助理", employeeId: "AI0004", canLogin: false };
  const execution = {
    requester,
    actor,
    profile: {
      id: 4,
      key: "workspace.business-assistant",
      displayName: "Workspace 提案助理",
      roleName: "AI查询与变更提案助理",
      responsibilities: "负责 Workspace 内的受控查询、操作与变更提案",
      allowedToolKeys: ["source.searchWorkspaceCode"],
      runtime: {
        bindingId: 5,
        kind: "workspace" as const,
        instructions: "只在 Workspace 授权范围内执行，不承担本地代码开发。",
      },
      actorEmployeeId: "AI0004",
      actorEmployeeName: "Workspace 提案助理",
    },
  };
  const answer = buildAgentIdentityAnswer(execution);
  const context = buildAgentIdentityContext(execution);

  assert.match(answer, /本次请求人是：张宇凡，工号 00123/);
  assert.match(answer, /虚拟员工 Workspace 提案助理（工号 AI0004/);
  assert.match(answer, /确认责任仍属于请求人/);
  assert.match(context, /运行载体: workspace/);
  assert.match(context, /不承担本地代码开发/);
});
