import type { CoreUiComponentRegistration } from "./component-registry-types";

export const foundation_extra_registry_entries = [
  {
    name: "FIELD_TAG_CONTAINER_CLASS",
    category: "common",
    subcategory: "common.foundation",
    description: "标签字段壳 class token",
    example: "多标签输入字段使用 Core 默认容器样式。",
    composes: ["getFieldShellClassName"],
  },
  {
    name: "getToolbarActionClassName",
    category: "common",
    subcategory: "common.foundation",
    description: "工具栏动作样式",
    example: "业务优先使用 CommandButton 或 Toolbar 渲染文字动作；仅在 Toolbar custom 区域等少量自定义挂载点直接使用。",
  },
  {
    name: "dataTableClassNames",
    category: "common",
    subcategory: "common.foundation",
    description: "表格样式配方",
    example: "业务自渲染表格结构时复用 DataTable 同一套样式 token。",
  },
  {
    name: "moduleCardColorClasses",
    category: "common",
    subcategory: "common.foundation",
    description: "模块卡片颜色",
    example: "设置首页的功能卡片按人力资源、财务等分类显示统一颜色。",
  },
  {
    name: "getModuleCardClassName",
    category: "common",
    subcategory: "common.foundation",
    description: "模块卡片样式",
    example: "设置首页功能卡片按人力资源、财务等分类使用统一颜色变体。",
    composes: ["moduleCardColorClasses"],
  },] as const satisfies readonly CoreUiComponentRegistration[];
