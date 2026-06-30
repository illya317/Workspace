import "server-only";

import {
  createFkRegistryFromRegistrations,
  type FkRegistration,
} from "../fk-targets";
import { getRegisteredModuleDefinition } from "../../module-registry";
import { searchFkOptions, normalizeLifecycleScope } from "../fk-registry";
import { authorize } from "../auth/authorize";
import { isRootAdminUser } from "../auth/root";
import { serviceError, serviceOk } from "../api";

const DOCS_FK_REGISTRATIONS = getRegisteredModuleDefinition("@workspace/platform:docs").fkRegistrations as FkRegistration[];
const DOCS_FK_REGISTRY = createFkRegistryFromRegistrations(DOCS_FK_REGISTRATIONS);

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
  permission: { resourceKey: string; action: "access" | "write" | "delete" | "admin" },
) {
  if (await isRootAdminUser(userId)) return true;
  return authorize({ user: userId, ...permission });
}
