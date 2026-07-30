import "server-only";

import {
  createRelationCatalogFromRegistrations,
} from "@workspace/platform/server/relation-targets";
import type { PermissionActionKey } from "@workspace/platform/permission-actions";
import { getRegisteredModuleDefinition } from "@workspace/platform/module-registry";
import { searchFkOptions, normalizeLifecycleScope } from "@workspace/platform/server/relation-registry";
import { authorize } from "@workspace/platform/server/auth/authorize";
import { isRootAdminUser } from "@workspace/platform/server/auth/root";
import { serviceError, serviceOk } from "@workspace/platform/server/api";

const DOCS_RELATION_REGISTRATIONS = getRegisteredModuleDefinition("@workspace/docs").relationRegistrations ?? [];
const DOCS_FK_REGISTRY = createRelationCatalogFromRegistrations(DOCS_RELATION_REGISTRATIONS);

export async function executeDocsEditorReferenceOptionsCommand(command: {
  fkKey: string;
  keyword: string;
  lifecycleScope?: string;
  userId: number;
  params?: Record<string, string>;
}) {
  const definition = DOCS_FK_REGISTRY.require(command.fkKey);
  if (definition.scope !== "docs") return serviceError("无权限", 403);
  if (!(await canUseReference(command.userId, definition.permission))) return serviceError("无权限", 403);
  const items = await searchFkOptions(DOCS_FK_REGISTRY, {
    fkKey: command.fkKey,
    keyword: command.keyword,
    lifecycleScope: command.lifecycleScope ? normalizeLifecycleScope(command.lifecycleScope) : undefined,
    userId: command.userId,
    params: command.params,
  });
  return serviceOk({ items });
}

async function canUseReference(
  userId: number,
  permission: { resourceKey: string; action: PermissionActionKey },
) {
  if (await isRootAdminUser(userId)) return true;
  return authorize({ user: userId, ...permission });
}
