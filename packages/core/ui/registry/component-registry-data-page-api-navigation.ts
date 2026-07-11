import type { CoreUiComponentRegistration } from "./component-registry-types";

export const navigation_registry_entries = [
  {
    name: "NavigationSurface",
    description: "Core 内部导航 renderer；tabs、局部分页、header 上下文切换分别由 PageSurface、BodySurface、AppShell 的父声明拥有",
    composes: ["TabBar", "Pagination", "NavigationSelectorTrigger"],
  },
  {
    name: "NavigationContextSelector",
    description: "AppShell 使用的导航上下文 selector runtime renderer",
    composes: ["NavigationSurface"],
  },
] as const satisfies readonly CoreUiComponentRegistration[];
