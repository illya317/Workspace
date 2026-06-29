/**
 * 工具栏、行内动作、图标按钮的统一图标集合。
 * 这是封闭集合：新增图标必须经整体 UI 评审，禁止业务侧自行引入其他图标。
 */
export const ACTION_GLYPH_KINDS = [
  "add",
  "send",
  "stop",
  "edit",
  "check",
  "double-check",
  "verified",
  "cancel",
  "x",
  "copy",
  "save",
  "delete",
  "delete-bin",
  "delete-minus",
  "view",
  "eye-off",
  "search",
  "filter",
  "refresh",
  "reset",
  "restore",
  "link",
  "unlink",
  "settings",
  "reclass",
  "generate",
  "print",
  "lock",
  "unlock",
  "permission-organization",
  "permission-derived",
  "sort",
  "more",
  "download",
  "upload",
  "archive",
  "list",
  "history",
  "panel-open",
  "panel-close",
] as const;

export type ActionGlyphKind = (typeof ACTION_GLYPH_KINDS)[number];
export type ActionGlyphIconAlias = "back" | "create" | "open";

export interface ActionGlyphProps {
  kind: ActionGlyphKind;
  className?: string;
}

export interface ActionGlyphGroup {
  key: string;
  label: string;
  representative: ActionGlyphKind;
  kinds: readonly ActionGlyphKind[];
}

export const ACTION_GLYPH_GROUPS = [
  { key: "create", label: "新建", representative: "add", kinds: ["add"] },
  { key: "input", label: "输入控制", representative: "send", kinds: ["send", "stop"] },
  { key: "edit", label: "编辑保存", representative: "edit", kinds: ["edit", "save"] },
  { key: "confirm", label: "确认状态", representative: "check", kinds: ["check", "double-check", "verified", "cancel", "x"] },
  { key: "delete", label: "删除", representative: "delete-bin", kinds: ["delete", "delete-bin", "delete-minus"] },
  { key: "view", label: "查看显示", representative: "view", kinds: ["view", "eye-off", "list", "panel-open", "panel-close"] },
  { key: "filter", label: "搜索筛选", representative: "search", kinds: ["search", "filter", "sort"] },
  { key: "refresh", label: "刷新恢复", representative: "refresh", kinds: ["refresh", "reset", "history"] },
  { key: "transfer", label: "传输归档", representative: "download", kinds: ["download", "upload", "archive", "restore"] },
  { key: "relation", label: "关联复制", representative: "link", kinds: ["link", "unlink", "copy"] },
  { key: "system", label: "系统权限", representative: "settings", kinds: ["settings", "lock", "unlock", "permission-organization", "permission-derived"] },
  { key: "output", label: "生成打印", representative: "generate", kinds: ["generate", "print", "reclass"] },
  { key: "more", label: "更多", representative: "more", kinds: ["more"] },
] as const satisfies readonly ActionGlyphGroup[];

export type ActionGlyphGroupKey = (typeof ACTION_GLYPH_GROUPS)[number]["key"];

type ActionGlyphGroupDefinition = (typeof ACTION_GLYPH_GROUPS)[number];

export interface ActionGlyphToolbarGroup {
  key: string;
  label: string;
  groupKeys: readonly ActionGlyphGroupKey[];
}

export const ACTION_GLYPH_TOOLBAR_GROUPS = [
  { key: "primary", label: "核心操作", groupKeys: ["create", "input", "edit", "confirm", "delete"] },
  { key: "browse", label: "浏览筛选", groupKeys: ["view", "filter", "refresh"] },
  { key: "extended", label: "扩展动作", groupKeys: ["transfer", "relation", "system", "output", "more"] },
] as const satisfies readonly ActionGlyphToolbarGroup[];

export type ActionGlyphToolbarGroupKey = (typeof ACTION_GLYPH_TOOLBAR_GROUPS)[number]["key"];

export interface ActionGlyphOrderItem {
  icon: ActionGlyphKind;
  group: ActionGlyphToolbarGroupKey;
  subgroup: ActionGlyphGroupKey;
  order: number;
}

export const ACTION_GLYPH_ORDER = [
  { icon: "add", group: "primary", subgroup: "create", order: 10000 },
  { icon: "send", group: "primary", subgroup: "input", order: 10500 },
  { icon: "stop", group: "primary", subgroup: "input", order: 10600 },
  { icon: "edit", group: "primary", subgroup: "edit", order: 11000 },
  { icon: "save", group: "primary", subgroup: "edit", order: 11100 },
  { icon: "check", group: "primary", subgroup: "confirm", order: 12000 },
  { icon: "double-check", group: "primary", subgroup: "confirm", order: 12050 },
  { icon: "verified", group: "primary", subgroup: "confirm", order: 12100 },
  { icon: "cancel", group: "primary", subgroup: "confirm", order: 12200 },
  { icon: "x", group: "primary", subgroup: "confirm", order: 12300 },
  { icon: "delete-bin", group: "primary", subgroup: "delete", order: 13000 },
  { icon: "delete", group: "primary", subgroup: "delete", order: 13100 },
  { icon: "delete-minus", group: "primary", subgroup: "delete", order: 13200 },

  { icon: "view", group: "browse", subgroup: "view", order: 20000 },
  { icon: "eye-off", group: "browse", subgroup: "view", order: 20100 },
  { icon: "list", group: "browse", subgroup: "view", order: 20200 },
  { icon: "panel-open", group: "browse", subgroup: "view", order: 20300 },
  { icon: "panel-close", group: "browse", subgroup: "view", order: 20400 },
  { icon: "search", group: "browse", subgroup: "filter", order: 21000 },
  { icon: "filter", group: "browse", subgroup: "filter", order: 21100 },
  { icon: "sort", group: "browse", subgroup: "filter", order: 21200 },
  { icon: "refresh", group: "browse", subgroup: "refresh", order: 22000 },
  { icon: "reset", group: "browse", subgroup: "refresh", order: 22100 },
  { icon: "history", group: "browse", subgroup: "refresh", order: 22200 },

  { icon: "download", group: "extended", subgroup: "transfer", order: 30000 },
  { icon: "upload", group: "extended", subgroup: "transfer", order: 30100 },
  { icon: "archive", group: "extended", subgroup: "transfer", order: 30200 },
  { icon: "restore", group: "extended", subgroup: "transfer", order: 30300 },
  { icon: "link", group: "extended", subgroup: "relation", order: 31000 },
  { icon: "unlink", group: "extended", subgroup: "relation", order: 31100 },
  { icon: "copy", group: "extended", subgroup: "relation", order: 31200 },
  { icon: "settings", group: "extended", subgroup: "system", order: 32000 },
  { icon: "lock", group: "extended", subgroup: "system", order: 32100 },
  { icon: "unlock", group: "extended", subgroup: "system", order: 32200 },
  { icon: "permission-organization", group: "extended", subgroup: "system", order: 32300 },
  { icon: "permission-derived", group: "extended", subgroup: "system", order: 32400 },
  { icon: "reclass", group: "extended", subgroup: "output", order: 32900 },
  { icon: "generate", group: "extended", subgroup: "output", order: 33000 },
  { icon: "print", group: "extended", subgroup: "output", order: 33100 },
  { icon: "more", group: "extended", subgroup: "more", order: 34000 },
] as const satisfies readonly ActionGlyphOrderItem[];

type ActionGlyphOrderDefinition = (typeof ACTION_GLYPH_ORDER)[number];

export const ACTION_GLYPH_ORDER_BY_KIND: Record<ActionGlyphKind, ActionGlyphOrderDefinition> = ACTION_GLYPH_ORDER.reduce(
  (acc, item) => {
    acc[item.icon] = item;
    return acc;
  },
  {} as Record<ActionGlyphKind, ActionGlyphOrderDefinition>,
);

export const ACTION_GLYPH_GROUP_BY_KIND: Record<ActionGlyphKind, ActionGlyphGroupDefinition> = ACTION_GLYPH_GROUPS.reduce(
  (acc, group) => {
    group.kinds.forEach((kind) => {
      acc[kind] = group;
    });
    return acc;
  },
  {} as Record<ActionGlyphKind, ActionGlyphGroupDefinition>,
);

export type ActionGlyphActionVariant = "primary" | "secondary" | "danger";
export type ActionGlyphActionSection = "primary" | "search" | "filter" | "edit" | "action" | "meta" | "view";

export interface ActionGlyphActionDefinition {
  key: string;
  label: string;
  icon: ActionGlyphKind;
  variant: ActionGlyphActionVariant;
  section: ActionGlyphActionSection;
}

export const ACTION_GLYPH_ACTIONS = [
  { key: "create", label: "新建", icon: "add", variant: "primary", section: "primary" },
  { key: "add", label: "添加", icon: "add", variant: "primary", section: "primary" },
  { key: "send", label: "发送", icon: "send", variant: "primary", section: "primary" },
  { key: "stop", label: "停止", icon: "stop", variant: "danger", section: "action" },
  { key: "edit", label: "编辑", icon: "edit", variant: "secondary", section: "edit" },
  { key: "save", label: "保存", icon: "save", variant: "primary", section: "edit" },
  { key: "confirm", label: "确认", icon: "check", variant: "primary", section: "primary" },
  { key: "cancel", label: "取消", icon: "cancel", variant: "secondary", section: "edit" },
  { key: "close", label: "关闭", icon: "cancel", variant: "secondary", section: "edit" },
  { key: "delete", label: "删除", icon: "delete-bin", variant: "danger", section: "edit" },
  { key: "remove", label: "移除", icon: "delete-minus", variant: "danger", section: "edit" },
  { key: "view", label: "查看", icon: "view", variant: "secondary", section: "view" },
  { key: "open", label: "打开", icon: "view", variant: "secondary", section: "view" },
  { key: "back", label: "返回", icon: "list", variant: "secondary", section: "view" },
  { key: "list", label: "列表", icon: "list", variant: "secondary", section: "view" },
  { key: "search", label: "搜索", icon: "search", variant: "secondary", section: "search" },
  { key: "filter", label: "筛选", icon: "filter", variant: "secondary", section: "filter" },
  { key: "sort", label: "排序", icon: "sort", variant: "secondary", section: "filter" },
  { key: "refresh", label: "刷新", icon: "refresh", variant: "secondary", section: "view" },
  { key: "retry", label: "重试", icon: "refresh", variant: "secondary", section: "view" },
  { key: "reset", label: "重置", icon: "reset", variant: "secondary", section: "filter" },
  { key: "restore", label: "恢复", icon: "restore", variant: "secondary", section: "action" },
  { key: "history", label: "历史", icon: "history", variant: "secondary", section: "view" },
  { key: "download", label: "下载", icon: "download", variant: "secondary", section: "action" },
  { key: "export", label: "导出", icon: "download", variant: "secondary", section: "action" },
  { key: "upload", label: "上传", icon: "upload", variant: "secondary", section: "action" },
  { key: "import", label: "导入", icon: "upload", variant: "secondary", section: "action" },
  { key: "archive", label: "归档", icon: "archive", variant: "secondary", section: "action" },
  { key: "link", label: "关联", icon: "link", variant: "secondary", section: "action" },
  { key: "unlink", label: "取消关联", icon: "unlink", variant: "secondary", section: "action" },
  { key: "copy", label: "复制", icon: "copy", variant: "secondary", section: "action" },
  { key: "settings", label: "设置", icon: "settings", variant: "secondary", section: "action" },
  { key: "lock", label: "锁定", icon: "lock", variant: "secondary", section: "action" },
  { key: "unlock", label: "解锁", icon: "unlock", variant: "secondary", section: "action" },
  { key: "reclass", label: "重分类", icon: "reclass", variant: "secondary", section: "action" },
  { key: "generate", label: "生成", icon: "generate", variant: "primary", section: "action" },
  { key: "print", label: "打印", icon: "print", variant: "secondary", section: "action" },
  { key: "more", label: "更多", icon: "more", variant: "secondary", section: "action" },
  { key: "panel-open", label: "显示面板", icon: "panel-open", variant: "secondary", section: "view" },
  { key: "panel-close", label: "隐藏面板", icon: "panel-close", variant: "primary", section: "view" },
] as const satisfies readonly ActionGlyphActionDefinition[];

export type ActionGlyphActionKey = (typeof ACTION_GLYPH_ACTIONS)[number]["key"];
type ActionGlyphActionDefinitionEntry = (typeof ACTION_GLYPH_ACTIONS)[number];

export const ACTION_GLYPH_ACTION_BY_KEY: Record<ActionGlyphActionKey, ActionGlyphActionDefinitionEntry> = ACTION_GLYPH_ACTIONS.reduce(
  (acc, action) => {
    acc[action.key] = action;
    return acc;
  },
  {} as Record<ActionGlyphActionKey, ActionGlyphActionDefinitionEntry>,
);

const ACTION_GLYPH_ALIAS_TO_ACTION_KEY = {
  new: "create",
  submit: "confirm",
  apply: "confirm",
  ok: "confirm",
  clear: "delete",
  destroy: "delete",
  show: "view",
  hide: "open",
  retry: "retry",
} as const satisfies Record<string, ActionGlyphActionKey>;

const ACTION_GLYPH_LABEL_MATCHERS: Array<{ value: string; action: ActionGlyphActionKey }> = [
  { value: "取消关联", action: "unlink" },
  { value: "新建", action: "create" },
  { value: "创建", action: "create" },
  { value: "添加", action: "add" },
  { value: "保存", action: "save" },
  { value: "删除", action: "delete" },
  { value: "移除", action: "remove" },
  { value: "取消", action: "cancel" },
  { value: "关闭", action: "close" },
  { value: "确认", action: "confirm" },
  { value: "应用", action: "confirm" },
  { value: "查看", action: "view" },
  { value: "打开", action: "open" },
  { value: "返回", action: "back" },
  { value: "搜索", action: "search" },
  { value: "筛选", action: "filter" },
  { value: "刷新", action: "refresh" },
  { value: "重试", action: "retry" },
  { value: "重置", action: "reset" },
  { value: "恢复", action: "restore" },
  { value: "历史", action: "history" },
  { value: "下载", action: "download" },
  { value: "导出", action: "export" },
  { value: "上传", action: "upload" },
  { value: "导入", action: "import" },
  { value: "归档", action: "archive" },
  { value: "关联", action: "link" },
  { value: "复制", action: "copy" },
  { value: "设置", action: "settings" },
  { value: "锁定", action: "lock" },
  { value: "解锁", action: "unlock" },
  { value: "重分类", action: "reclass" },
  { value: "生成", action: "generate" },
  { value: "打印", action: "print" },
];

function normalizeActionKey(value: string) {
  return value.trim().toLowerCase().replaceAll("_", "-");
}

export function resolveActionGlyphIcon(icon?: ActionGlyphKind | ActionGlyphIconAlias): ActionGlyphKind | undefined {
  if (!icon) return undefined;
  if (icon === "back") return ACTION_GLYPH_ACTION_BY_KEY.back.icon;
  if (icon === "create") return ACTION_GLYPH_ACTION_BY_KEY.create.icon;
  if (icon === "open") return ACTION_GLYPH_ACTION_BY_KEY.open.icon;
  return icon;
}

export function resolveActionGlyphAction(input: {
  key?: string;
  label?: string;
  type?: "button" | "submit";
}): ActionGlyphActionDefinitionEntry | undefined {
  if (input.key) {
    const normalizedKey = normalizeActionKey(input.key);
    const exact = ACTION_GLYPH_ACTION_BY_KEY[normalizedKey as ActionGlyphActionKey];
    if (exact) return exact;
    const aliased = ACTION_GLYPH_ALIAS_TO_ACTION_KEY[normalizedKey as keyof typeof ACTION_GLYPH_ALIAS_TO_ACTION_KEY];
    if (aliased) return ACTION_GLYPH_ACTION_BY_KEY[aliased];
  }
  if (input.type === "submit") return ACTION_GLYPH_ACTION_BY_KEY.confirm;
  if (input.label) {
    const match = ACTION_GLYPH_LABEL_MATCHERS.find((item) => input.label?.includes(item.value));
    if (match) return ACTION_GLYPH_ACTION_BY_KEY[match.action];
  }
  return undefined;
}

export { ActionGlyph } from "./ActionGlyphParts";
