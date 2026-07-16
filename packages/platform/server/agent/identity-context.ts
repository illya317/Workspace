import type { SessionUser } from "@workspace/platform/types";

import {
  normalizeAgentExecutionContext,
  type AgentExecutionPrincipal,
} from "./execution";

function identityLines(user: SessionUser) {
  return [
    `- Workspace userId: ${user.id}`,
    `- 登录名: ${user.username}`,
    user.employeeName ? `- 员工姓名: ${user.employeeName}` : "",
    user.employeeId ? `- 员工工号: ${user.employeeId}` : "",
    user.wxUserId ? `- 企业微信 userId: ${user.wxUserId}` : "",
    user.company ? `- 公司: ${user.company}` : "",
    user.departmentName ? `- 部门: ${user.departmentName}` : "",
  ].filter(Boolean);
}

export function buildAgentIdentityContext(principal: AgentExecutionPrincipal) {
  const execution = normalizeAgentExecutionContext(principal);
  if (!execution.profile) {
    return `当前已认证用户身份（只用于理解“我/本人”等指代，不扩大任何权限）：\n${identityLines(execution.requester).join("\n")}`;
  }
  const lines = [
    "真实请求人（拥有会话、提案和确认责任）：",
    ...identityLines(execution.requester),
    "虚拟员工执行主体（执行业务动作并进入操作审计）：",
    `- Agent 配置: ${execution.profile.displayName} (${execution.profile.key})`,
    `- 岗位角色: ${execution.profile.roleName}`,
    `- 职责: ${execution.profile.responsibilities}`,
    `- 运行载体: ${execution.profile.runtime.kind}`,
    `- 本运行时职责边界: ${execution.profile.runtime.instructions}`,
    `- 员工: ${execution.profile.actorEmployeeName}（工号 ${execution.profile.actorEmployeeId}）`,
    `- Workspace userId: ${execution.actor.id}`,
  ].filter(Boolean);
  return `当前 Agent 双身份上下文。权限始终取请求人与虚拟员工的交集，不得混淆二者：\n${lines.join("\n")}`;
}

export function buildAgentIdentityAnswer(principal: AgentExecutionPrincipal) {
  const execution = normalizeAgentExecutionContext(principal);
  const user = execution.requester;
  const employee = [user.employeeName, user.employeeId ? `工号 ${user.employeeId}` : ""]
    .filter(Boolean)
    .join("，");
  const bindings = [
    employee || `登录名 ${user.username}`,
    user.wxUserId ? `企业微信 userId ${user.wxUserId}` : "",
    `Workspace userId ${user.id}`,
  ].filter(Boolean);
  if (!execution.profile) return `你当前认证为：${bindings.join("；")}。`;
  return `本次请求人是：${bindings.join("；")}。当前由虚拟员工 ${execution.profile.actorEmployeeName}（工号 ${execution.profile.actorEmployeeId}，岗位角色：${execution.profile.roleName}）执行；会话与确认责任仍属于请求人。`;
}

export function isAgentIdentityQuestion(message: string) {
  return /(?:我是谁|你知道我是谁|我的(?:姓名|名字|工号|企业微信(?:\s*userId)?|workspace\s*userId)|本人(?:姓名|工号))/i.test(message);
}
