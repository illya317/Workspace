import type { CoreUiComponentRegistration } from "./component-registry-types";
import { generatedCoreUiSurfaceContracts } from "./generated-surface-contracts";

export const page_api_registry_entries = [
  {
    name: "MetricCard",
    description: "指标卡片",
  },
  {
    name: "MetricsSurface",
    description: "L1 正文指标 Surface",
    contract: generatedCoreUiSurfaceContracts.MetricsSurface,
    declares: [
      { name: "metrics", description: "指标卡片列表。" },
      { name: "actions", description: "指标块局部动作；页面级动作放 PageSurface.toolbar。" },
    ],
    composes: ["MetricCard", "CommandButton", "EmptyStateCard", "PanelCard"],
  },
  {
    name: "MetricTile",
    description: "详情页指标块",
    composes: ["MetricCard"],
  },
  {
    name: "ModuleCard",
    description: "模块入口卡片",
    composes: ["ModuleCardBody", "getModuleCardClassName", "moduleCardColorClasses", "getToolbarActionClassName"],
  },
] as const satisfies readonly CoreUiComponentRegistration[];
