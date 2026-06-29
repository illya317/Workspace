import type { CoreUiComponentRegistration } from "./component-registry-types";

export const foundation_extra_registry_entries = [
  {
    name: "FIELD_TAG_CONTAINER_CLASS",
    description: "标签字段壳 class token",
    composes: ["getFieldShellClassName"],
  },
  {
    name: "getToolbarActionClassName",
    description: "工具栏动作样式",
  },
  {
    name: "dataTableClassNames",
    description: "表格样式配方",
  },
  {
    name: "moduleCardColorClasses",
    description: "模块卡片颜色",
  },
  {
    name: "getModuleCardClassName",
    description: "模块卡片样式",
    composes: ["moduleCardColorClasses"],
  },] as const satisfies readonly CoreUiComponentRegistration[];
