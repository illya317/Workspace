import type { CoreUiComponentRegistration } from "./component-registry-types";

export const page_frame_registry_entries = [
  {
    name: "AnalysisPageFrame",
    category: "page",
    subcategory: "page.frame",
    description: "分析页骨架",
    composes: ["PageContent", "TabBar"],
  },
  {
    name: "DatabasePageFrame",
    category: "page",
    subcategory: "page.frame",
    description: "数据库页骨架",
    composes: ["PageContent", "TabBar", "Toolbar"],
  },
  {
    name: "ModuleGridPage",
    category: "page",
    subcategory: "page.frame",
    description: "模块入口页骨架",
    composes: ["PageContent"],
  },
  {
    name: "TemplateWorkbenchFrame",
    category: "common",
    subcategory: "common.block",
    description: "模板工作台骨架",
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
    category: "common",
    subcategory: "common.block",
    description: "页面样式预览",
  },
  {
    name: "WorkspaceSplitPage",
    category: "page",
    subcategory: "page.frame",
    description: "主从分栏页面",
    composes: ["PageContent", "SplitWorkspace", "Toolbar", "ActionButton", "TabBar"],
  },
] as const satisfies readonly CoreUiComponentRegistration[];
