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
    name: "MobileExperienceBoundary",
    description: "移动端原生、横屏工作台和不开放三种产品级呈现边界",
    composes: ["ActionGlyph"],
  },
  {
    name: "page-style-preview",
    description: "页面样式预览",
  },
] as const satisfies readonly CoreUiComponentRegistration[];
