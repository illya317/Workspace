import type { CoreUiComponentRegistration } from "./component-registry-types";
import { generatedCoreUiSurfaceContracts } from "./generated-surface-contracts";

export const page_api_registry_entries = [
  {
    name: "FeedbackProvider",
    category: "feedback",
    subcategory: "feedback.renderer",
    description: "统一反馈 Provider",
    composes: ["ConfirmModal", "Toast"],
  },
  {
    name: "DataTable",
    category: "data",
    subcategory: "data.table",
    description: "通用数据表格",
    composes: ["ActionButton", "dataTableClassNames"],
  },
  {
    name: "DetailModal",
    category: "common",
    subcategory: "common.overlay",
    description: "详情弹窗",
  },
  {
    name: "DocumentSurface",
    category: "document",
    subcategory: "document.surface",
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
        description: "纸面页列表，承载 A4、fluid 或 QC 纸质模板内容。",
        children: [
          { name: "size", description: "页面尺寸：a4 / fluid / wide。" },
          { name: "content", description: "页面正文内容。" },
        ],
      },
    ],
  },
  {
    name: "DisclosureRecordCard",
    category: "data",
    subcategory: "data.record",
    description: "可展开记录卡片",
  },
  {
    name: "DisclosureSectionHeader",
    category: "common",
    subcategory: "common.chrome",
    description: "可折叠分组标题",
  },
  {
    name: "DropdownMenu",
    category: "common",
    subcategory: "common.overlay",
    description: "下拉菜单",
    composes: ["DropdownSurface"],
  },
  {
    name: "EmptyStateCard",
    category: "common",
    subcategory: "common.display",
    description: "空状态卡片",
  },
  {
    name: "EntityDetailLayout",
    category: "form",
    subcategory: "form.layout",
    description: "实体详情布局",
    composes: ["FieldGrid", "FieldControl"],
  },
  {
    name: "FkFieldInput",
    category: "common",
    subcategory: "common.selection",
    description: "外键搜索输入",
    composes: ["FieldInputShell", "SearchInput"],
  },
  {
    name: "FieldValueFilter",
    category: "common",
    subcategory: "common.selection",
    description: "字段值筛选",
    composes: ["InputControl", "SelectField", "PickerOptionButton"],
  },
  {
    name: "FileField",
    category: "common",
    subcategory: "common.input",
    description: "文件选择字段",
  },
  {
    name: "FormField",
    category: "form",
    subcategory: "form.field",
    description: "表单字段容器",
  },
  {
    name: "FormSurface",
    category: "form",
    subcategory: "form.surface",
    description: "L1 正文表单 Surface",
    contract: generatedCoreUiSurfaceContracts.FormSurface,
    declares: [
      {
        name: "kind",
        description: "表单语义。",
        children: [
          { name: "fields", description: "标准字段表单。" },
          { name: "filters", description: "筛选表单。" },
          { name: "inline", description: "行内字段表单。" },
          { name: "detail", description: "详情字段布局。" },
          { name: "login", description: "登录表单布局。" },
        ],
      },
      {
        name: "fields",
        description: "字段、只读字段、分组、重复组和短说明。",
        children: [
          { name: "field", description: "普通输入字段，具体 spec 交给 InputControl。" },
          { name: "readonly", description: "只读字段。" },
          { name: "tagList", description: "标签列表字段。" },
          { name: "section", description: "字段分组。" },
          { name: "repeatable", description: "可重复字段组。" },
          { name: "note", description: "短说明；复杂 ReactNode 应迁到 BlockSurface 或专用 Surface。" },
        ],
      },
      { name: "field", description: "单字段快捷声明。" },
      { name: "columns", description: "字段网格列数。" },
      { name: "mode", description: "字段布局模式。" },
      { name: "actions", description: "表单局部动作；页面级动作放 PageSurface.toolbar。" },
    ],
    composes: ["FieldGrid", "FormField", "InputControl", "ReadOnlyField", "TagListInput", "TextField", "TextareaField", "CalendarDateInput", "ChoiceGroup", "SelectField", "FileField", "HiddenDataField", "DetailModal", "CommandButton"],
  },
  {
    name: "FormShell",
    category: "form",
    subcategory: "form.surface",
    description: "表单外壳",
  },
  {
    name: "Badge",
    category: "common",
    subcategory: "common.display",
    description: "通用徽标",
  },
  {
    name: "HiddenDataField",
    category: "common",
    subcategory: "common.input",
    description: "隐藏数据字段",
  }] as const satisfies readonly CoreUiComponentRegistration[];
