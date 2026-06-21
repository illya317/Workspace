import type { ResourceRegistration } from "@workspace/core";

export interface ModuleRuntimeOverride {
  enabled?: boolean;
  hidden?: boolean;
  label?: string;
  desc?: string;
  disabledReason?: string;
}

export type ModuleRuntimeOverrideMap = Record<string, ModuleRuntimeOverride>;

export const moduleRuntimeOverrides = {
  "work.projects": {
    label: "项目管理",
  },
} satisfies ModuleRuntimeOverrideMap;

export function resourceNameFromOverride(
  resource: ResourceRegistration,
  override?: ModuleRuntimeOverride,
) {
  return override?.label ?? resource.name;
}
