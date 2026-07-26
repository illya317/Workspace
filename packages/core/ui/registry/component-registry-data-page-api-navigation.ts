import type { CoreUiComponentRegistration } from "./component-registry-types";

export const navigation_registry_entries = [
  {
    name: "NavigationSurface",
    description: "Core 内部导航 renderer；PageSurface tabs 支持父项 children，移动端短 Tab 使用分段切换，长 Tab/父子 Tab 自动收口为可换行的分组栏目选择面板",
    composes: ["TabBar", "Pagination", "NavigationSelectorTrigger"],
  },
  {
    name: "NavigationContextSelector",
    description: "AppShell 使用的导航上下文 selector runtime renderer",
    composes: ["NavigationSurface"],
  },
] as const satisfies readonly CoreUiComponentRegistration[];
