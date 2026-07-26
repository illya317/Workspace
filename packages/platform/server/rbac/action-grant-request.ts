import { isResourceEnabled } from "@workspace/platform/effective-module-registry";
import { isPermissionActionKey, type PermissionActionKey } from "@workspace/platform/permission-actions";
import { isPermissionActionGrantable } from "@workspace/platform/permission-action-grantability";
import { isPermissionActionSupported } from "@workspace/platform/permission-resource-policy";
import { isRegisteredSpaceResourceKey } from "@workspace/platform/space-registry";
import { prisma, type Prisma } from "@workspace/platform/server/prisma";
import { isRootAdminUser } from "../auth/root";
import { canManageResourceGrant } from "./admin-scope";
import {
  evaluatePermissionAction,
  PermissionGrantMutationError,
  setSubjectPermissionActionGrant,
  type SubjectType,
} from "./action-grants";
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

export type AuthorizedPermissionGrantRequest = Omit<PermissionGrantRequest, "actionKey"> & {
  actionKey: PermissionActionKey;
};

export type PermissionGrantAuthorizationResult =
  | { ok: true; request: AuthorizedPermissionGrantRequest }
  | { ok: false; error: string; status?: number };

export interface PermissionGrantAuthorizationOptions {
  client?: Prisma.TransactionClient | typeof prisma;
}

export async function authorizePermissionGrantRequest(
  input: PermissionGrantRequest,
  options: PermissionGrantAuthorizationOptions = {},
): Promise<PermissionGrantAuthorizationResult> {
  const client = options.client ?? prisma;
  const actionKey = isPermissionActionKey(input.actionKey) ? input.actionKey : null;
  if (!actionKey) return { ok: false, error: "参数错误: actionKey 不支持", status: 400 };
  if (input.subjectType === "user" && !input.isSystemAdmin) {
    return { ok: false, error: "个人直授仅限内置 admin 账号维护", status: 403 };
  }
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
    ? await evaluatePermissionAction(input.actorUserId, input.resourceKey, "grant", { scopeId: input.scopeId, projection: input.projection, client })
    : false;
  if (!input.preauthorizedActor && !scopedGrantManager && !await canManageResourceGrant(input.actorUserId, input.resourceKey, actionKey, client)) {
    return { ok: false, error: "无权限管理该资源权限", status: 403 };
  }
  return { ok: true, request: { ...input, actionKey } };
}

export async function setPermissionGrantFromRequest(input: PermissionGrantRequest): Promise<PermissionGrantRequestResult> {
  const authorization = await authorizePermissionGrantRequest(input);
  if (!authorization.ok) return authorization;
  const authorized = authorization.request;
  try {
    await setSubjectPermissionActionGrant(
      authorized.subjectType,
      authorized.subjectId,
      authorized.resourceKey,
      authorized.actionKey,
      authorized.value,
      {
        actorUserId: authorized.actorUserId,
        scopeId: authorized.scopeId ?? null,
        authorizationResourceKeys: [authorized.resourceKey],
        beforeMutation: async (tx) => {
          const refreshed = await authorizePermissionGrantRequest({
            ...input,
            isSystemAdmin: await isRootAdminUser(input.actorUserId, tx),
          }, { client: tx });
          if (!refreshed.ok) {
            throw new PermissionGrantMutationError(refreshed.error, refreshed.status ?? 403);
          }
        },
      },
    );
  } catch (error) {
    if (error instanceof PermissionGrantMutationError) {
      return { ok: false, error: error.message, status: error.status };
    }
    throw error;
  }
  return { ok: true };
}
