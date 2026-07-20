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
              { name: "items", description: "直接声明稳定 key、业务 value 与结构化 card。" },
              { name: "group", description: "可在 item 上声明所属结构分组；分组标题与间距由 SelectorSurface 统一渲染。" },
              { name: "selectedId", description: "当前选中项 key。" },
              { name: "onSelect", description: "选择回调。" },
            ],
          },
          {
            name: "tree",
            description: "树形选择区。",
            children: [
              { name: "items", description: "根节点直接声明稳定 key、业务 value、结构化 card 与 children。" },
              { name: "selectedId", description: "当前选中节点 key。" },
              { name: "expandedIds", description: "受控展开节点。" },
              { name: "defaultExpandedLevel", description: "非受控初始展开层级。" },
              { name: "onToggle", description: "展开/收起回调。" },
            ],
          },
        ],
      },
      { name: "commands", description: "选择区局部命令。" },
      { name: "status", description: "结构化卡片状态：success / warning / danger / muted / default；可声明 disabled 与语义动作。" },
      { name: "card.actions", description: "结构化卡片尾部动作；只声明 action 与 icon，交互隔离和位置由 SelectorSurface 负责。" },
      { name: "card.inlineEdit", description: "结构化卡片就地文本编辑；调用方只声明值、dirty/saving 状态和保存/取消回调，输入框、动作位置及 Enter/Escape 行为由 SelectorSurface 负责。" },
      { name: "loading", description: "选择区加载态。" },
      { name: "emptyText", description: "选择区空态文案。" },
    ],
    composes: ["SelectorCard", "PanelCard", "Badge", "EmptyStateCard", "InputSurface"],
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
    description: "结构化表格；移动端简单行和简单矩阵转纵向记录卡片，复杂跨行跨列矩阵保留横向浏览",
  },
  {
    name: "TabBar",
    description: "Tab 切换栏；桌面 accordion 同栏展开 children，移动端按选项数量切换为分段控件或可完整换行的分组栏目选择面板",
    declares: [
      { name: "tabs.children", description: "父 Tab 的子视图项。" },
      { name: "accordion", description: "启用同栏父子 Tab 展开结构。" },
      { name: "activeChild", description: "当前选中的子 Tab。" },
    ],
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
    composes: ["FieldShell", "getFieldInputClassName"],
  },
  {
    name: "TimeField",
    description: "时间输入框",
    composes: ["FieldShell", "getFieldInputClassName"],
  },
  {
    name: "Toast",
    description: "底层提示组件（Core 内部使用）",
    composes: ["ConfirmModal"],
  },] as const satisfies readonly CoreUiComponentRegistration[];
