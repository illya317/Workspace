import type { ModuleLifecycleStatus } from "@workspace/core";
import { MODULES } from "./module-nav";

export const MODULE_LIFECYCLE_LABELS: Record<ModuleLifecycleStatus, string> = {
  "workspace-owned": "Workspace 本地资料",
  "external-system": "外部系统负责",
  "workspace-analysis": "外部数据 + Workspace 分析",
  "legacy-fallback": "历史 fallback",
  deprecated: "准备下线",
};

export const MODULE_LIFECYCLE_BY_RESOURCE: Partial<Record<string, ModuleLifecycleStatus>> =
  Object.fromEntries(
    MODULES.flatMap((moduleDef) => {
      const entries: [string, ModuleLifecycleStatus][] = [];
      if (moduleDef.resourceKey && moduleDef.lifecycleStatus) {
        entries.push([moduleDef.resourceKey, moduleDef.lifecycleStatus]);
      }
      for (const child of moduleDef.children ?? []) {
        if (child.resourceKey && child.lifecycleStatus) {
          entries.push([child.resourceKey, child.lifecycleStatus]);
        }
      }
      return entries;
    }),
  );

export function getModuleLifecycleStatus(
  resourceKey?: string,
): ModuleLifecycleStatus | undefined {
  if (!resourceKey) return undefined;
  return MODULE_LIFECYCLE_BY_RESOURCE[resourceKey];
}
