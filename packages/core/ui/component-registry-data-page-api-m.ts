import type { CoreUiComponentRegistration } from "./component-registry-types";

export const page_api_registry_entries = [
  {
    name: "MetricCard",
    accessLayer: "page-api",
    kind: "layout",
    description: "指标卡片",
    example: "分析页展示“本月 128”“同比 +12%”“预警 3”。",
  },
  {
    name: "MetricTile",
    accessLayer: "page-api",
    kind: "layout",
    description: "详情页指标块",
    example: "部门详情页展示岗位数、编制数等紧凑指标。",
    composes: ["MetricCard"],
  },
  {
    name: "ModuleCard",
    accessLayer: "page-api",
    kind: "layout",
    description: "模块入口卡片",
    example: "设置首页或模块首页使用卡片展示功能入口，支持链接、点击和纯展示模式；平台通过 renderLink 接入 Next Link。",
    composes: ["ModuleCardBody"],
    foundations: ["getModuleCardClassName", "moduleCardColorClasses", "getToolbarActionClassName"],
  },
] as const satisfies readonly CoreUiComponentRegistration[];
