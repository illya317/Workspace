import type { CoreUiComponentRegistration } from "./component-registry-types";

export const foundation_registry_entries = [
  {
    name: "ActionGlyph",
    description: "通用动作图标",
  },
  {
    name: "ACTION_GLYPH_KINDS",
    description: "动作图标种类集合",
  },
  {
    name: "ACTION_GLYPH_ORDER",
    description: "动作图标排序配置",
  },
  {
    name: "ACTION_GLYPH_ACTIONS",
    description: "动作语义到图标、标签和默认样式的映射配置",
  },
  {
    name: "ACTION_GLYPH_ACTION_BY_KEY",
    description: "按动作 key 索引动作语义配置",
    composes: ["ACTION_GLYPH_ACTIONS"],
  },
  {
    name: "resolveActionGlyphAction",
    description: "从动作 key、文案或 submit 类型推断动作语义",
    composes: ["ACTION_GLYPH_ACTION_BY_KEY"],
  },
  {
    name: "resolveActionGlyphIcon",
    description: "把动作图标别名解析为 ActionGlyphKind",
    composes: ["ACTION_GLYPH_ACTION_BY_KEY"],
  },
  {
    name: "ACTION_GLYPH_GROUPS",
    description: "动作图标语义分组",
  },
  {
    name: "ACTION_GLYPH_TOOLBAR_GROUPS",
    description: "工具栏动作分组配置",
  },
  {
    name: "getFieldInputClassName",
    description: "字段输入样式",
  },
  {
    name: "getFieldShellClassName",
    description: "字段壳样式",
  },
  {
    name: "getFieldGridCellClassName",
    description: "字段网格单元容器样式",
  },
  {
    name: "getFieldGridMainRowClassName",
    description: "字段网格主行样式",
  },
  {
    name: "getFieldGridHelperRowClassName",
    description: "字段网格辅助行样式",
  },
  {
    name: "getFieldGridLabelClassName",
    description: "字段网格标签样式",
  },
  {
    name: "getFieldGridValueClassName",
    description: "字段网格值区样式",
  },
  {
    name: "getFieldGroupTitleClassName",
    description: "字段分组标题样式",
  },
  {
    name: "getReadOnlyFieldClassName",
    description: "只读字段样式",
  },
  {
    name: "getFieldValueClassName",
    description: "字段值文本样式",
  },
  {
    name: "getTagInputShellClassName",
    description: "标签输入外壳样式",
  },
  {
    name: "getTagInlineInputClassName",
    description: "标签内联输入样式",
  },
  {
    name: "getTagPillClassName",
    description: "标签项样式",
  },
  {
    name: "FIELD_CONTROL_HEIGHT",
    description: "字段控件默认高度 token",
  },
  {
    name: "FIELD_CONTROL_PADDING_X",
    description: "字段控件默认水平 padding token",
  },
  {
    name: "FIELD_CONTROL_TEXT",
    description: "字段控件默认字号 token",
  },
  {
    name: "FIELD_LABEL_TEXT",
    description: "字段标签默认文本 token",
  },
  {
    name: "FIELD_SHELL_CLASS",
    description: "默认字段壳 class token",
    composes: ["getFieldShellClassName"],
  },
] as const satisfies readonly CoreUiComponentRegistration[];
