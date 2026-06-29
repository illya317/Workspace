import type { CoreUiComponentRegistration } from "./component-registry-types";

export const page_api_registry_entries = [
  {
    name: "MetricCard",
    category: "data",
    subcategory: "data.metric",
    description: "指标卡片",
  },
  {
    name: "MetricTile",
    category: "data",
    subcategory: "data.metric",
    description: "详情页指标块",
    composes: ["MetricCard"],
  },
  {
    name: "ModuleCard",
    category: "common",
    subcategory: "common.block",
    description: "模块入口卡片",
    composes: ["ModuleCardBody", "getModuleCardClassName", "moduleCardColorClasses", "getToolbarActionClassName"],
  },
] as const satisfies readonly CoreUiComponentRegistration[];
