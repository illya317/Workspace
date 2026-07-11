import { isResourceEnabled } from "@workspace/platform/effective-module-registry";
import { isPermissionActionKey } from "@workspace/platform/permission-actions";
import { isPermissionActionGrantable } from "@workspace/platform/permission-action-grantability";
import { isPermissionActionSupported } from "@workspace/platform/permission-resource-policy";
import { isRegisteredSpaceResourceKey } from "@workspace/platform/space-registry";
import { canManageResourceGrant } from "./admin-scope";
import { evaluatePermissionAction, setSubjectPermissionActionGrant, type SubjectType } from "./action-grants";
import { canMutatePermissionGrantAction } from "./action-grant-policy";
import type { PermissionResourceProjectionKind } from "./resource-projection";

export interface PermissionGrantRequest {
  actorUserId: number;
  subjectType: SubjectType;
  subjectId: number;
  resourceKey: string;
  actionKey: string;
  value: boolean;
  scopeId?: string | null;
  isSystemAdmin: boolean;
  preauthorizedActor?: boolean;
  projection?: PermissionResourceProjectionKind;
}

export type PermissionGrantRequestResult =
  | { ok: true }
  | { ok: false; error: string; status?: number };

export async function setPermissionGrantFromRequest(input: PermissionGrantRequest): Promise<PermissionGrantRequestResult> {
  const actionKey = isPermissionActionKey(input.actionKey) ? input.actionKey : null;
  if (!actionKey) return { ok: false, error: "参数错误: actionKey 不支持", status: 400 };
  if (!isResourceEnabled(input.resourceKey)) return { ok: false, error: "模块未启用，不能配置该资源权限", status: 403 };
  if (input.value && !isPermissionActionSupported(input.resourceKey, actionKey)) {
    return { ok: false, error: "该资源尚未接入该权限动作", status: 400 };
  }
  if (!canMutatePermissionGrantAction(actionKey, input.isSystemAdmin)) {
    return { ok: false, error: "无权限维护该授权动作", status: 403 };
  }
  if (input.value && !isPermissionActionGrantable(input.resourceKey, actionKey)) {
    return {
      ok: false,
      error: isRegisteredSpaceResourceKey(input.resourceKey)
        ? "空间入口资源仅支持访问权限"
        : "该资源尚未接入该权限动作",
      status: 400,
    };
  }
  const scopedGrantManager = input.scopeId !== undefined && input.scopeId !== null
    ? await evaluatePermissionAction(input.actorUserId, input.resourceKey, "grant", { scopeId: input.scopeId, projection: input.projection })
    : false;
  if (!input.preauthorizedActor && !scopedGrantManager && !await canManageResourceGrant(input.actorUserId, input.resourceKey, actionKey)) {
    return { ok: false, error: "无权限管理该资源权限", status: 403 };
  }
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
