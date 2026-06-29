import type { CoreUiComponentRegistration } from "./component-registry-types";

export const page_api_registry_entries = [
  {
    name: "SelectorSurface",
    description: "通用选择区 Surface",
    declares: [
      {
        name: "kind",
        description: "选择区类型：先选 list 或 tree，再声明对应数据和节点展示。",
        children: [
          {
            name: "list",
            description: "平铺列表选择区。",
            children: [
              { name: "items", description: "列表数据。" },
              { name: "selectedId", description: "当前选中项 key。" },
              { name: "onSelect", description: "选择回调。" },
              { name: "getKey", description: "从 item 解析稳定 key。" },
              { name: "renderItem", description: "声明每张卡片的标题、副标题、编码、指标和尾部状态。" },
              { name: "groupBy", description: "可选分组。" },
              { name: "filter", description: "可选搜索过滤器。" },
            ],
          },
          {
            name: "tree",
            description: "树形选择区。",
            children: [
              { name: "items", description: "根节点数据。" },
              { name: "getChildren", description: "从节点解析子节点。" },
              { name: "selectedId", description: "当前选中节点 key。" },
              { name: "expandedIds", description: "受控展开节点。" },
              { name: "defaultExpandedLevel", description: "非受控初始展开层级。" },
              { name: "onToggle", description: "展开/收起回调。" },
              { name: "renderItem", description: "声明节点卡片的层级、标题、编码、指标和状态。" },
              { name: "filter", description: "可选搜索过滤器。" },
            ],
          },
        ],
      },
      { name: "commands", description: "选择区局部命令。" },
      { name: "loading", description: "选择区加载态。" },
      { name: "emptyText", description: "选择区空态文案。" },
    ],
    composes: ["SelectorPanel", "PanelCard", "SearchInput", "Badge", "EmptyStateCard"],
  },
  {
    name: "SelectorPanel",
    description: "选择器面板内部 renderer",
    composes: ["PanelCard", "SearchInput", "SelectionGrid", "SelectorList", "SelectorTree", "EmptyStateCard"],
  },
  {
    name: "createSelectorPanelSection",
    description: "选择器区块声明助手",
    composes: ["SelectorSurface", "BodySurface"],
  },
  {
    name: "SwitchField",
    description: "开关字段",
  },
  {
    name: "TagListInput",
    description: "标签列表输入",
    composes: [
      "RemovableTag",
      "TagPill",
      "getTagInputShellClassName",
      "getTagInlineInputClassName",
      "getTagPillClassName",
    ],
  },
  {
    name: "TagStringInput",
    description: "字符串标签输入",
    composes: ["RemovableTag", "TagInlineTextField", "FieldShell"],
  },
  {
    name: "StructuredTable",
    description: "结构化表格",
  },
  {
    name: "TabBar",
    description: "Tab 切换栏",
    composes: ["ActionButton"],
  },
  {
    name: "TableScrollFrame",
    description: "表格滚动外壳",
    composes: ["DataTable"],
  },
  {
    name: "TextareaField",
    description: "多行文本输入",
  },
  {
    name: "TextField",
    description: "通用文本输入",
    composes: ["FieldInputShell", "getFieldInputClassName"],
  },
  {
    name: "TimeField",
    description: "时间输入框",
    composes: ["FieldInputShell", "getFieldInputClassName"],
  },
  {
    name: "Toast",
    description: "底层提示组件（Core 内部使用）",
    composes: ["ConfirmModal"],
  },] as const satisfies readonly CoreUiComponentRegistration[];
