import type { CoreUiComponentRegistration } from "./component-registry-types";
import { generatedCoreUiSurfaceContracts } from "./generated-surface-contracts";

export const page_api_registry_entries = [
  {
    name: "FeedbackProvider",
    description: "统一反馈 Provider",
    composes: ["ConfirmModal", "Toast"],
  },
  {
    name: "DataTable",
    description: "通用数据表格",
    composes: ["ActionButton", "dataTableClassNames"],
  },
  {
    name: "DetailModal",
    description: "详情弹窗",
  },
  {
    name: "DocumentSurface",
    description: "文档纸面 Surface",
    contract: generatedCoreUiSurfaceContracts.DocumentSurface,
    declares: [
      {
        name: "kind",
        description: "文档正文类型。",
        children: [
          { name: "pages", description: "纸面页列表。" },
        ],
      },
      {
        name: "pages",
        description: "pages 专属 payload。",
        children: [
          { name: "items", description: "纸面页列表，承载 A4、fluid 或 QC 纸质模板内容。" },
          { name: "item.size", description: "页面尺寸：a4 / fluid / wide。" },
          { name: "item.content", description: "页面正文内容。" },
        ],
      },
    ],
  },
  {
    name: "DisclosureRecordCard",
    description: "可展开记录卡片",
  },
  {
    name: "DisclosureSectionHeader",
    description: "可折叠分组标题",
  },
  {
    name: "DropdownMenu",
    description: "下拉菜单",
    composes: ["DropdownSurface"],
  },
  {
    name: "EmptyStateCard",
    description: "空状态卡片",
  },
  {
    name: "EntityDetailLayout",
    description: "实体详情布局",
    composes: ["FieldGrid", "FieldControl"],
  },
  {
    name: "FkFieldInput",
    description: "外键搜索输入",
    composes: ["FieldInputShell", "SearchInput"],
  },
  {
    name: "FieldValueFilter",
    description: "字段值筛选",
    composes: ["InputControl", "SelectField", "PickerOptionButton"],
  },
  {
    name: "FileField",
    description: "文件选择字段",
  },
  {
    name: "FormField",
    description: "表单字段容器",
  },
  {
    name: "FormSurface",
    description: "L1 正文表单 Surface",
    contract: generatedCoreUiSurfaceContracts.FormSurface,
    declares: [
      {
        name: "kind",
        description: "表单语义。",
        children: [
          { name: "fields", description: "标准字段表单。" },
          { name: "filters", description: "筛选表单。" },
          { name: "detail", description: "详情字段布局。" },
          { name: "login", description: "登录表单布局。" },
        ],
      },
      {
        name: "content",
        description: "字段树和布局声明。",
        children: [
          { name: "field", description: "普通输入字段，具体 spec 交给 InputControl。" },
          { name: "readonly", description: "只读字段。" },
          { name: "tagList", description: "标签列表字段。" },
          { name: "section", description: "字段分组。" },
          { name: "repeatable", description: "可重复字段组。" },
          { name: "note", description: "短说明；复杂 ReactNode 应迁到 BlockSurface 或专用 Surface。" },
        ],
      },
      { name: "commands", description: "表单内部短命令；页面/section 标题动作归 PageSurface。" },
      { name: "submit", description: "表单提交事件。" },
    ],
    composes: ["ActionGlyph", "FieldGrid", "FormField", "InputControl", "ReadOnlyField", "TagListInput", "TextField", "TextareaField", "CalendarDateInput", "ChoiceGroup", "SelectField", "FileField", "HiddenDataField", "CommandButton"],
  },
  {
    name: "FormShell",
    description: "表单外壳",
  },
  {
    name: "Badge",
    description: "通用徽标",
  },
  {
    name: "HiddenDataField",
    description: "隐藏数据字段",
  }] as const satisfies readonly CoreUiComponentRegistration[];
