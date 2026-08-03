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
    composes: ["FloatingPortalSurface"],
  },
  {
    name: "FloatingPortalSurface",
    description: "脱离父容器裁切的通用浮层定位器",
  },
  {
    name: "ToolbarFilterPanel",
    description: "Toolbar 内多组低频枚举筛选的声明式收口；桌面弹层按内容自适应宽度并使用纯图标触发器与生效条件摘要，移动端展开到统一筛选面板",
    composes: ["ActionButton", "DropdownSurface", "SelectionOptionButton", "RemovableTag"],
  },
  {
    name: "ModuleCardBody",
    description: "模块卡片主体",
    composes: ["moduleCardColorClasses"],
  },
  {
    name: "NavigationSelectorTrigger",
    description: "NavigationSurface 内部上下文切换触发器",
  },
  {
    name: "PaperChoiceInput",
    description: "PaperInputSurface 内部纸面选项 renderer",
  },
  {
    name: "PaperDateInput",
    description: "PaperInputSurface 内部纸面日期 renderer",
    composes: ["InputSurface"],
  },
  {
    name: "PaperLineInput",
    description: "PaperInputSurface 内部纸面行输入 renderer",
  },
  {
    name: "PaperSelectInput",
    description: "PaperInputSurface 内部纸面选择 renderer",
  },
  {
    name: "SelectionOptionButton",
    description: "选择器选项按钮",
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
