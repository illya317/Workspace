import type { CoreUiComponentRegistration } from "./component-registry-types";

export const page_frame_registry_entries = [
  {
    name: "DatabasePageFrame",
    description: "PageSurface 唯一内部页面骨架",
    composes: ["PageContent"],
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
] as const satisfies readonly CoreUiComponentRegistration[];
