import type { ActionGlyphKind } from "./internal/action/ActionGlyphs";
import type { BadgeTone } from "./internal/common/Badge";

export type SelectorSurfaceLooseItem = ReturnType<typeof JSON.parse>;
export type SelectorSurfaceActionSize = "sm" | "md" | "lg";
export type SelectorSurfaceText = string | number;

export interface SelectorSurfaceCommandSpec {
  key: string;
  label: string;
  icon?: ActionGlyphKind | "back" | "create" | "open";
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
  size?: SelectorSurfaceActionSize;
  truncate?: boolean;
}

export interface SelectorSurfaceInlineEditSpec {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  dirty?: boolean;
  saving?: boolean;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  ariaLabel?: string;
}

export interface SelectorSurfaceCardSpec {
  title: SelectorSurfaceText;
  subtitle?: SelectorSurfaceText;
  code?: SelectorSurfaceText;
  codeTone?: SelectorSurfaceStatusSpec["tone"];
  level?: number;
  levelLabel?: SelectorSurfaceText;
  levelTone?: BadgeTone;
  showLevelBadge?: boolean;
  meta?: SelectorSurfaceText[] | SelectorSurfaceText;
  metaLine?: SelectorSurfaceText;
  trailing?: SelectorSurfaceText;
  actions?: SelectorSurfaceCommandSpec[];
  inlineEdit?: SelectorSurfaceInlineEditSpec;
  status?: SelectorSurfaceStatusSpec;
  archived?: boolean;
  active?: boolean;
  tone?: "blue" | "emerald" | "amber" | "slate";
  showToggle?: boolean;
  size?: "sm" | "md";
}

export interface SelectorSurfaceStatusSpec {
  label: string;
  tone?: "success" | "warning" | "danger" | "muted" | "default";
  disabled?: boolean;
  onClick?: () => void;
}

interface SelectorSurfaceCommonSpec {
  title?: string;
  commands?: SelectorSurfaceCommandSpec[];
  selectedId: string | number | null;
  loading?: boolean;
  loadingText?: string;
  emptyText?: string;
}

export interface SelectorSurfaceStructuredListItemSpec<T> { key: string | number; value: T; card: SelectorSurfaceCardSpec; group?: string; }
export interface SelectorSurfaceStructuredListSpec<T = SelectorSurfaceLooseItem> extends SelectorSurfaceCommonSpec { kind: "list"; items: SelectorSurfaceStructuredListItemSpec<T>[]; onSelect: (item: T) => void; size?: "sm" | "md"; }

interface SelectorSurfaceTreeCommonSpec<T> extends SelectorSurfaceCommonSpec { kind: "tree"; onSelect: (item: T) => void; expandedIds?: Iterable<string | number>; defaultExpandedIds?: Iterable<string | number>; defaultExpandedLevel?: number; onToggle?: (id: string | number, expanded: boolean) => void; collapsible?: boolean; }
export interface SelectorSurfaceStructuredTreeItemSpec<T> { key: string | number; value: T; card: SelectorSurfaceCardSpec; children?: SelectorSurfaceStructuredTreeItemSpec<T>[]; }
export interface SelectorSurfaceStructuredTreeSpec<T = SelectorSurfaceLooseItem> extends SelectorSurfaceTreeCommonSpec<T> { items: SelectorSurfaceStructuredTreeItemSpec<T>[]; }
export type SelectorSurfaceTreeSpec<T = SelectorSurfaceLooseItem> = SelectorSurfaceStructuredTreeSpec<T>;
export type SelectorSurfaceProps<T = SelectorSurfaceLooseItem> = SelectorSurfaceStructuredListSpec<T> | SelectorSurfaceStructuredTreeSpec<T>;
