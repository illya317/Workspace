import type { SessionUser } from "@workspace/platform/types";

export function buildAgentIdentityContext(user: SessionUser) {
  const lines = [
    `- Workspace userId: ${user.id}`,
    `- 登录名: ${user.username}`,
    user.employeeName ? `- 员工姓名: ${user.employeeName}` : "",
    user.employeeId ? `- 员工工号: ${user.employeeId}` : "",
    user.wxUserId ? `- 企业微信 userId: ${user.wxUserId}` : "",
    user.company ? `- 公司: ${user.company}` : "",
    user.departmentName ? `- 部门: ${user.departmentName}` : "",
  ].filter(Boolean);
  return `当前已认证用户身份（只用于理解“我/本人”等指代，不扩大任何权限）：\n${lines.join("\n")}`;
}

export function buildAgentIdentityAnswer(user: SessionUser) {
  const employee = [user.employeeName, user.employeeId ? `工号 ${user.employeeId}` : ""]
    .filter(Boolean)
    .join("，");
  const bindings = [
    employee || `登录名 ${user.username}`,
    user.wxUserId ? `企业微信 userId ${user.wxUserId}` : "",
    `Workspace userId ${user.id}`,
  ].filter(Boolean);
  return `你当前认证为：${bindings.join("；")}。`;
}

export function isAgentIdentityQuestion(message: string) {
  return /(?:我是谁|你知道我是谁|我的(?:姓名|名字|工号|企业微信(?:\s*userId)?|workspace\s*userId)|本人(?:姓名|工号))/i.test(message);
}
