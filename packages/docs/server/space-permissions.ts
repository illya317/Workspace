import "server-only";

import {
  serviceError,
  serviceOk,
  type ServiceResult,
} from "@workspace/platform/server/api";
import {
  canManageScopedPermissionGrant,
} from "@workspace/platform/server/business-space-permissions";
import { isSpacePermissionTargetSupportedByKey } from "@workspace/platform/space-registry";
import { docsEditorDb, type DocsEditorSpaceRow } from "./db";
import {
  docsEditorScopeId,
} from "./permissions";

export async function loadManageableDocsEditorPermissionSpace(input: {
  userId: number;
  spaceId: number;
  resourceKey: string;
}): Promise<ServiceResult<{ space: DocsEditorSpaceRow }>> {
  const db = docsEditorDb();
  const space = await db.documentTemplateSpace.findFirst({ where: { id: input.spaceId, deletedAt: null } });
  if (!space) return serviceError("模板空间不存在", 404);
  if (!isSpacePermissionTargetSupportedByKey("docs.editor", space.targetType)) return serviceError("该空间不开放权限配置", 400);
  const scopeId = docsEditorScopeId(space);
  const hasGrant = await canManageScopedPermissionGrant(input.userId, input.resourceKey, scopeId);
  if (!hasGrant) {
    return serviceError("无权限管理该模板空间", 403);
  }
  return serviceOk({ space });
}
