import type { ResourceRegistration } from "@workspace/core/module-contract";

export interface ModuleRuntimeOverride {
  enabled?: boolean;
  hidden?: boolean;
  label?: string;
  desc?: string;
  disabledReason?: string;
}

export type ModuleRuntimeOverrideMap = Record<string, ModuleRuntimeOverride>;

const STATIC_MODULE_RUNTIME_OVERRIDES = {
  "work.tasks": {
    label: "工作计划",
    desc: "个人计划、待办任务和执行跟踪",
  },
  "work.projects": {
    label: "项目管理",
    desc: "组织项目、角色分工、预算和风险",
  },
} satisfies ModuleRuntimeOverrideMap;

let dynamicModuleRuntimeOverrides: ModuleRuntimeOverrideMap | null = null;

export function getDynamicModuleRuntimeOverrides(): ModuleRuntimeOverrideMap {
  return dynamicModuleRuntimeOverrides ?? {};
}

export function setDynamicModuleRuntimeOverrides(overrides: ModuleRuntimeOverrideMap) {
  dynamicModuleRuntimeOverrides = overrides;
}

export function getModuleRuntimeOverrides(): ModuleRuntimeOverrideMap {
  return {
    ...STATIC_MODULE_RUNTIME_OVERRIDES,
    ...getDynamicModuleRuntimeOverrides(),
  };
}

export function resourceNameFromOverride(
  resource: ResourceRegistration,
  override?: ModuleRuntimeOverride,
) {
  return override?.label ?? resource.name;
}
