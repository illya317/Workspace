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
    username: "test-user-a",
    employeeName: "测试员工甲",
    employeeId: "EMP-X001",
    wxUserId: "WX-TEST-001",
    departmentName: null,
  });

  assert.match(context, /Workspace userId: 17/);
  assert.match(context, /员工姓名: 测试员工甲/);
  assert.match(context, /员工工号: EMP-X001/);
  assert.match(context, /企业微信 userId: WX-TEST-001/);
  assert.doesNotMatch(context, /部门:/);
});

test("identity questions get a deterministic exact authenticated answer", () => {
  const user = {
    id: 17,
    username: "test-user-a",
    employeeName: "测试员工甲",
    employeeId: "EMP-X001",
    wxUserId: "WX-TEST-001",
  };
  assert.equal(isAgentIdentityQuestion("你知道我是谁吗？"), true);
  assert.equal(isAgentIdentityQuestion("查一下测试员工甲"), false);
  assert.equal(
    buildAgentIdentityAnswer(user),
    "你当前认证为：测试员工甲，工号 EMP-X001；企业微信 userId WX-TEST-001；Workspace userId 17。",
  );
});

test("Workspace Agent identity keeps requester, virtual employee and runtime roles separate", () => {
  const requester = { id: 17, username: "test-user-a", employeeName: "测试员工甲", employeeId: "EMP-X001" };
  const actor = { id: 32, username: "synthetic-agent-user", employeeName: "示例提案助理", employeeId: "BOT-X004", canLogin: false };
  const execution = {
    requester,
    actor,
    profile: {
      id: 4,
      key: "synthetic.agent.profile",
      displayName: "示例提案助理",
      roleName: "AI查询与变更提案助理",
      responsibilities: "负责 Workspace 内的受控查询、操作与变更提案",
      allowedToolKeys: ["workspace.api.read"],
      runtime: {
        bindingId: 5,
        kind: "workspace" as const,
        instructions: "只在 Workspace 授权范围内执行，不承担本地代码开发。",
      },
      actorEmployeeId: "BOT-X004",
      actorEmployeeName: "示例提案助理",
    },
  };
  const answer = buildAgentIdentityAnswer(execution);
  const context = buildAgentIdentityContext(execution);

  assert.match(answer, /本次请求人是：测试员工甲，工号 EMP-X001/);
  assert.match(answer, /虚拟员工 示例提案助理（工号 BOT-X004/);
  assert.match(answer, /确认责任仍属于请求人/);
  assert.match(context, /运行载体: workspace/);
  assert.match(context, /不承担本地代码开发/);
});
