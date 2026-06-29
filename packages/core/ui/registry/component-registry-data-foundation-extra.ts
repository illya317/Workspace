import type { CoreUiComponentRegistration } from "./component-registry-types";

export const foundation_extra_registry_entries = [
  {
    name: "FIELD_TAG_CONTAINER_CLASS",
    category: "common",
    subcategory: "common.foundation",
    description: "标签字段壳 class token",
    composes: ["getFieldShellClassName"],
  },
  {
    name: "getToolbarActionClassName",
    category: "common",
    subcategory: "common.foundation",
    description: "工具栏动作样式",
  },
  {
    name: "dataTableClassNames",
    category: "common",
    subcategory: "common.foundation",
    description: "表格样式配方",
  },
  {
    name: "moduleCardColorClasses",
    category: "common",
    subcategory: "common.foundation",
    description: "模块卡片颜色",
  },
  {
    name: "getModuleCardClassName",
    category: "common",
    subcategory: "common.foundation",
    description: "模块卡片样式",
    composes: ["moduleCardColorClasses"],
  },] as const satisfies readonly CoreUiComponentRegistration[];
