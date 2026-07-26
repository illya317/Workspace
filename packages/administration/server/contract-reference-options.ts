import { serviceError } from "@workspace/platform/server/api";
import { authorize } from "@workspace/platform/server/auth";
import {
  normalizeLifecycleScope,
  searchFkOptions,
  type FkSearchParams,
} from "@workspace/platform/server/relation-registry";
import { ADMINISTRATION_FK_REGISTRY } from "./fk-registry";

export async function executeContractReferenceOptionsCommand(command: {
  fkKey: string;
  keyword: string;
  lifecycleScope?: string;
  userId: number;
  params: FkSearchParams;
}) {
  try {
    const definition = ADMINISTRATION_FK_REGISTRY.require(command.fkKey);
    if (definition.scope !== "administration") return serviceError("无权限", 403);
    const allowed = await authorize({
      user: command.userId,
      resourceKey: definition.permission.resourceKey,
      action: definition.permission.action,
    });
    if (!allowed) return serviceError("无权限", 403);
    const items = await searchFkOptions(ADMINISTRATION_FK_REGISTRY, {
      fkKey: command.fkKey,
      keyword: command.keyword,
      lifecycleScope: command.lifecycleScope
        ? normalizeLifecycleScope(command.lifecycleScope)
        : undefined,
      userId: command.userId,
      params: command.params,
    });
    return { items };
  } catch (error) {
    return serviceError(error instanceof Error ? error.message : "候选项查询失败", 400);
  }
}
