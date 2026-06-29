import type { CoreUiComponentRegistration } from "./component-registry-types";

export const navigation_registry_entries = [
  {
    name: "NavigationSurface",
    description: "页面、阶段和视图上下文导航 Surface",
    declares: [
      { name: "kind", description: "导航类型：tabs / steps / pagination。" },
      { name: "items", description: "tabs 导航项。" },
      { name: "steps", description: "steps 导航项。" },
      { name: "pagination", description: "分页声明。" },
      { name: "active", description: "当前 tabs 或 steps key。" },
    ],
    composes: ["TabBar", "Pagination"],
  },
] as const satisfies readonly CoreUiComponentRegistration[];
