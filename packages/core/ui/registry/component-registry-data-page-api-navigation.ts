import type { CoreUiComponentRegistration } from "./component-registry-types";

export const navigation_registry_entries = [
  {
    name: "NavigationSurface",
    description: "Core 内部导航 renderer；PageSurface tabs 支持父项 children 展开的 accordion 子 Tab，局部分页和 header 上下文切换仍由各自父声明拥有",
    composes: ["TabBar", "Pagination", "NavigationSelectorTrigger"],
  },
  {
    name: "NavigationContextSelector",
    description: "AppShell 使用的导航上下文 selector runtime renderer",
    composes: ["NavigationSurface"],
  },
] as const satisfies readonly CoreUiComponentRegistration[];
