import type { CoreUiComponentRegistration } from "./component-registry-types";

export const page_frame_registry_entries = [
  {
    name: "AnalysisPageFrame",
    description: "分析页骨架",
    composes: ["PageContent", "TabBar"],
  },
  {
    name: "DatabasePageFrame",
    description: "数据库页骨架",
    composes: ["PageContent", "TabBar", "Toolbar"],
  },
  {
    name: "ModuleGridPage",
    description: "模块入口页骨架",
    composes: ["PageContent"],
  },
  {
    name: "TemplateWorkbenchFrame",
    description: "可配置工作台骨架",
    composes: [
      "Toolbar",
      "SearchInput",
      "SelectorCard",
      "PanelCard",
      "Badge",
      "ActionButton",
      "EmptyStateCard",
      "getToolbarActionClassName",
    ],
  },
  {
    name: "page-style-preview",
    description: "页面样式预览",
  },
  {
    name: "WorkspaceSplitPage",
    description: "主从分栏页面",
    composes: ["PageContent", "SplitWorkspace", "Toolbar", "ActionButton", "TabBar"],
  },
] as const satisfies readonly CoreUiComponentRegistration[];
