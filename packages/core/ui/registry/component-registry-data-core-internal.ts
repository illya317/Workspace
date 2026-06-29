import type { CoreUiComponentRegistration } from "./component-registry-types";

export const core_internal_registry_entries = [
  {
    name: "ActionButton",
    description: "工具栏动作按钮",
    composes: ["ActionGlyph", "getToolbarActionClassName"],
  },
  {
    name: "RefreshActionButton",
    description: "工具栏刷新按钮",
    composes: ["ActionButton"],
  },
  {
    name: "BlockCreatePanel",
    description: "块状新建面板",
    composes: ["SectionCard", "CreateStartButton", "CreateConfirmActions"],
  },
  {
    name: "CreateConfirmActions",
    description: "新建确认动作",
    composes: ["ActionButton"],
  },
  {
    name: "CreateStartButton",
    description: "新建开始按钮",
    composes: ["ActionButton"],
  },
  {
    name: "DropdownSurface",
    description: "下拉浮层",
  },
  {
    name: "ToolbarOptionGroup",
    description: "工具栏选项组",
  },
  {
    name: "InlineCreatePanel",
    description: "内联新建面板",
    composes: ["CreateConfirmActions", "FormField"],
  },
  {
    name: "ModuleCardBody",
    description: "模块卡片主体",
    composes: ["moduleCardColorClasses"],
  },
  {
    name: "PickerOptionButton",
    description: "选择器选项按钮",
  },
  {
    name: "PickerShell",
    description: "选择器外壳",
    composes: ["SearchInput", "getFieldInputClassName"],
  },
  {
    name: "TagPill",
    description: "标签内核",
    composes: ["getTagPillClassName"],
  },
  {
    name: "RemovableTag",
    description: "可删除标签",
    composes: ["TagPill", "TagRemoveButton", "getTagPillClassName"],
  },
  {
    name: "SelectorCard",
    description: "选择卡片",
  },
  {
    name: "SelectorList",
    description: "选择列表渲染器",
    composes: ["SelectorCard", "EmptyStateCard"],
  },
  {
    name: "SelectorTree",
    description: "树形选择渲染器",
    composes: ["TreeNodeCard", "TreeNodeBranch"],
  },
  {
    name: "SplitWorkspace",
    description: "左右分栏工作区",
    composes: ["Toolbar", "ActionButton"],
  },
  {
    name: "TagRemoveButton",
    description: "标签删除按钮",
  },
  {
    name: "TreeNodeBranch",
    description: "树节点分支",
    composes: ["TreeNodeCard"],
  },
  {
    name: "TreeNodeCard",
    description: "树节点卡片",
    composes: ["Badge"],
  },
] as const satisfies readonly CoreUiComponentRegistration[];
