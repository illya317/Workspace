import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";

function positiveUserId(userId: number) {
  return Number.isInteger(userId) && userId > 0
    ? okCommand(userId)
    : failCommand("用户 ID 无效", 400, "userId");
}

export function buildDepartmentCodeSaveCommand(
  input: { code: string; name: string; company?: string; originalCode?: string },
  userId: number,
) {
  const actor = positiveUserId(userId);
  if (!actor.ok) return actor;
  const code = input.code.trim();
  const name = input.name.trim();
  if (!code) return failCommand("部门编码不能为空", 400, "code");
  if (!name) return failCommand("部门名称不能为空", 400, "name");
  return okCommand({ ...input, code, name, userId: actor.data });
}

export function buildDepartmentCodeDeleteCommand(code: string, userId: number) {
  const actor = positiveUserId(userId);
  if (!actor.ok) return actor;
  const normalized = code.trim();
  return normalized
    ? okCommand({ code: normalized, userId: actor.data })
    : failCommand("部门编码不能为空", 400, "code");
}

export function buildPositionCodeSaveCommand(
  input: { code: string; name: string; company?: string; originalCode?: string; departmentCode?: string },
  userId: number,
) {
  const actor = positiveUserId(userId);
  if (!actor.ok) return actor;
  const code = input.code.trim();
  const name = input.name.trim();
  if (!code) return failCommand("岗位编码不能为空", 400, "code");
  if (!name) return failCommand("岗位名称不能为空", 400, "name");
  return okCommand({ ...input, code, name, userId: actor.data });
}

export function buildPositionCodeDeleteCommand(code: string, userId: number) {
  const actor = positiveUserId(userId);
  if (!actor.ok) return actor;
  const normalized = code.trim();
  return normalized
    ? okCommand({ code: normalized, userId: actor.data })
    : failCommand("岗位编码不能为空", 400, "code");
}
