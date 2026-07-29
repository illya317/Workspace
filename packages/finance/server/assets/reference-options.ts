import { serviceError } from "@workspace/platform/server/api";
import { authorize } from "@workspace/platform/server/auth";
import {
  normalizeLifecycleScope,
  searchFkOptions,
  type FkSearchParams,
} from "@workspace/platform/server/relation-registry";
import { FINANCE_FK_REGISTRY } from "./fk-registry";

export async function executeFinanceAssetReferenceOptionsCommand(command: {
  fkKey: string;
  keyword: string;
  lifecycleScope?: string;
  userId: number;
  params: FkSearchParams;
}) {
  try {
    const definition = FINANCE_FK_REGISTRY.require(command.fkKey);
    if (definition.scope !== "finance" || !definition.key.startsWith("finance.assets.")) {
      return serviceError("无权限", 403);
    }
    const allowed = await authorize({
      user: command.userId,
      resourceKey: definition.permission.resourceKey,
      action: definition.permission.action,
    });
    if (!allowed) return serviceError("无权限", 403);
    const items = await searchFkOptions(FINANCE_FK_REGISTRY, {
      fkKey: command.fkKey,
      keyword: command.keyword,
      lifecycleScope: command.lifecycleScope ? normalizeLifecycleScope(command.lifecycleScope) : undefined,
      userId: command.userId,
      params: command.params,
    });
    return { items };
  } catch (error) {
    return serviceError(error instanceof Error ? error.message : "科目候选项查询失败", 400);
  }
}
