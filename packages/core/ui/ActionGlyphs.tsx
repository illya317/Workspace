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

export { ActionGlyph } from "./ActionGlyphParts";
