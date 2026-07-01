import { isResourceEnabled } from "@workspace/platform/effective-module-registry";
import { isLegacyPermissionActionKey, isPermissionActionKey, roleKeyToActionKey } from "@workspace/platform/permission-actions";
import { canManageResourceGrant } from "./admin-scope";
import { setSubjectPermissionActionGrant } from "./action-grants";
import { getResourceMaxRole, isRoleAllowedForResource } from "./maxRole";
import type { SubjectType } from "./grants";

export interface PermissionGrantRequest {
  actorUserId: number;
  subjectType: SubjectType;
  subjectId: number;
  resourceKey: string;
  actionKey?: string;
  roleKey?: string;
  value: boolean;
  scopeId?: string | null;
  isSystemAdmin: boolean;
}

export type PermissionGrantRequestResult =
  | { ok: true }
  | { ok: false; error: string; status?: number };

function resolveActionKey(input: Pick<PermissionGrantRequest, "actionKey" | "roleKey">) {
  const actionKey = input.actionKey ?? (input.roleKey ? roleKeyToActionKey(input.roleKey) : null);
  return actionKey && isPermissionActionKey(actionKey) ? actionKey : null;
}

async function validateLegacyRoleLimit(resourceKey: string, actionKey: NonNullable<ReturnType<typeof resolveActionKey>>) {
  if (!isLegacyPermissionActionKey(actionKey)) return null;
  if (await isRoleAllowedForResource(resourceKey, actionKey)) return null;
  const max = await getResourceMaxRole(resourceKey);
  const labels: Record<string, string> = { access: "访问", write: "编辑", delete: "删除", admin: "管理" };
  return `该资源最高仅支持 ${labels[max] || max}`;
}

export async function setPermissionGrantFromRequest(input: PermissionGrantRequest): Promise<PermissionGrantRequestResult> {
  const actionKey = resolveActionKey(input);
  if (!actionKey) return { ok: false, error: "参数错误: actionKey 不支持", status: 400 };
  if (!isResourceEnabled(input.resourceKey)) return { ok: false, error: "模块未启用，不能配置该资源权限", status: 403 };
  if (actionKey === "admin" && !input.isSystemAdmin) {
    return { ok: false, error: "仅系统管理员可管理 admin 权限", status: 403 };
  }
  if (!await canManageResourceGrant(input.actorUserId, input.resourceKey, actionKey)) {
    return { ok: false, error: "无权限管理该资源权限", status: 403 };
  }
  const legacyError = input.value ? await validateLegacyRoleLimit(input.resourceKey, actionKey) : null;
  if (legacyError) return { ok: false, error: legacyError, status: 400 };
  await setSubjectPermissionActionGrant(
    input.subjectType,
    input.subjectId,
    input.resourceKey,
    actionKey,
    input.value,
    { actorUserId: input.actorUserId, scopeId: input.scopeId ?? null },
  );
  return { ok: true };
}
