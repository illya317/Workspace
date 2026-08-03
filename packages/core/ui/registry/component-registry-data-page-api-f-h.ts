import type { CoreUiComponentRegistration } from "./component-registry-types";

export const page_api_registry_entries = [
  {
    name: "FeedbackProvider",
    description: "统一反馈 Provider",
    composes: ["ConfirmModal", "Toast"],
  },
  {
    name: "DataTable",
    description: "通用数据表格；普通列按内容和可用空间自适应，矩阵列保持固定布局",
    composes: ["ActionButton", "dataTableClassNames"],
  },
  {
    name: "DetailModal",
    description: "详情弹窗",
  },
  {
    name: "DocumentSurface",
    description: "文档纸面 Surface",
    declares: [
      {
        name: "kind",
        description: "文档正文类型。",
        children: [
          { name: "pages", description: "纸面页列表。" },
          { name: "viewer", description: "内嵌文档阅读器宿主。" },
        ],
      },
      {
        name: "pages",
        description: "pages 专属 payload。",
        children: [
          { name: "items", description: "纸面页列表，承载 A4、fluid 或宽幅纸面内容。" },
          { name: "item.size", description: "页面尺寸：a4 / fluid / wide。" },
          { name: "item.content", description: "页面正文内容。" },
        ],
      },
      {
        name: "viewer",
        description: "viewer 专属 payload。",
        children: [
          { name: "src", description: "可访问的文档阅读器地址或对象 URL。" },
          { name: "title", description: "阅读器的无障碍标题。" },
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
    name: "FkFieldInput",
    description: "外键搜索输入",
    composes: ["FieldShell", "FloatingPortalSurface", "SearchInput"],
  },
  {
    name: "FieldValueFilter",
    description: "字段值筛选",
    composes: ["FloatingPortalSurface", "InputSurface", "SearchableOptionInput", "SelectionOptionButton"],
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
    description: "正文表单 Surface",
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
          { name: "layout", description: "section 统一字段格式；columns 声明列数，fieldLayout 只选择 inline 或 stack，宽度、截断、对齐和标签区高度由 Core 计算。" },
          { name: "field", description: "普通输入字段，具体 spec 交给 InputSurface。" },
          { name: "required", description: "统一必填契约；required、InputSurface validation.required 或 required state 任一声明都会同步必填星号、输入语义和提交前校验。" },
          { name: "readonly", description: "只读字段。" },
          { name: "tagList", description: "标签列表字段；append.field 无论声明普通选项还是远程 FK，均先显示加号，点击后展开输入并在选中或点外部后收起。" },
          { name: "rowSpan", description: "字段单元格可声明占 2 或 3 行，适用于头像、图片等高内容。" },
          { name: "section", description: "字段分组。" },
          { name: "repeatable", description: "可重复字段组；无标题记录的行级动作与字段同排，不生成只有动作的空白标题行。" },
          { name: "note", description: "短说明；复杂 ReactNode 应迁到专用 Surface。" },
        ],
      },
      { name: "header", description: "表单自有标题和说明；生命周期动作与标题在同一表单头部渲染。" },
      { name: "actions", description: "表单生命周期动作；业务只声明 action，Core 统一图标、顺序、样式和位置。" },
      { name: "commands", description: "筛选表单内部短命令；不承载保存、提交、取消、归档和审批动作。" },
      { name: "submit", description: "表单提交事件；Enter 与主 save/submit action 共用 disabled 状态，不形成按钮之外的旁路。" },
    ],
    composes: ["ActionGlyph", "FieldGrid", "FormField", "InputSurface", "ReadOnlyField", "TagListInput", "TextField", "TextareaField", "CalendarDateInput", "ChoiceGroup", "SearchableOptionInput", "FileField", "HiddenDataField", "CommandButton"],
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
