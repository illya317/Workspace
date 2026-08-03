import { ACTION_GLYPH_ACTION_BY_KEY, ACTION_GLYPH_ORDER_BY_KIND, resolveActionGlyphAction, type ActionGlyphKind } from "../action/ActionGlyphs";
import type { ToolbarActionGlyphKind, ToolbarActionKind, ToolbarItem } from "./Toolbar.types";

export type ToolbarRenderableAction = {
  key?: string;
  label: string;
  kind: ToolbarActionKind;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
};

function isToolbarActionGlyphKind(kind: ToolbarActionKind): kind is ToolbarActionGlyphKind {
  return kind in ACTION_GLYPH_ORDER_BY_KIND;
}

function resolveToolbarSemanticAction(action: ToolbarRenderableAction) {
  return isToolbarActionGlyphKind(action.kind) ? undefined : resolveActionGlyphAction({ key: action.kind, type: action.type });
}

export function resolveToolbarActionIcon(action: ToolbarRenderableAction): ActionGlyphKind {
  return resolveToolbarSemanticAction(action)?.icon ?? (action.kind as ActionGlyphKind);
}

export function resolveToolbarActionVariant(action: ToolbarRenderableAction) {
  return action.variant ?? resolveToolbarSemanticAction(action)?.variant;
}

function actionOrder(action: ToolbarRenderableAction) {
  return ACTION_GLYPH_ORDER_BY_KIND[resolveToolbarActionIcon(action)]?.order ?? Number.MAX_SAFE_INTEGER;
}

function actionGroup(action: ToolbarRenderableAction) {
  return ACTION_GLYPH_ORDER_BY_KIND[resolveToolbarActionIcon(action)]?.subgroup ?? "unknown";
}

export function getOrderedActions(actions: ToolbarRenderableAction[]) {
  return [...actions].sort((a, b) => actionOrder(a) - actionOrder(b));
}

function editGroupActions(item: Extract<ToolbarItem, { kind: "edit-group" }>): ToolbarRenderableAction[] {
  const actions: ToolbarRenderableAction[] = [];
  if (item.canEdit !== false && !item.editMode) actions.push({ key: `${item.key}-edit`, kind: "edit", label: item.editLabel ?? "编辑", onClick: item.onStartEdit });
  if (item.canEdit !== false && item.editMode) {
    actions.push({ key: `${item.key}-save`, kind: "save", label: item.saveLabel ?? "保存", variant: ACTION_GLYPH_ACTION_BY_KEY.save.variant, disabled: item.saving || !(item.dirty ?? true), onClick: item.onSave });
    actions.push({ key: `${item.key}-cancel`, kind: "cancel", label: ACTION_GLYPH_ACTION_BY_KEY.cancel.label, variant: ACTION_GLYPH_ACTION_BY_KEY.cancel.variant, onClick: item.onCancel });
  }
  if (item.canEdit !== false && item.onShowHistory) actions.push({ key: `${item.key}-history`, kind: "history", label: "最近改动", variant: ACTION_GLYPH_ACTION_BY_KEY.history.variant, onClick: item.onShowHistory });
  if (item.onDownload) actions.push({ key: `${item.key}-download`, kind: "download", label: ACTION_GLYPH_ACTION_BY_KEY.download.label, variant: ACTION_GLYPH_ACTION_BY_KEY.download.variant, disabled: item.downloading, onClick: item.onDownload });
  return actions;
}

export function getToolbarItemActions(item: ToolbarItem): ToolbarRenderableAction[] {
  if (item.kind === "action-group") return item.actions;
  if (item.kind === "edit-group") return editGroupActions(item);
  if (item.kind === "icon-button") return [{ key: item.key, kind: item.icon, label: item.label, variant: item.variant, disabled: item.disabled, onClick: item.onClick, type: item.type }];
  return [];
}

export function getToolbarItemActionBoundary(item: ToolbarItem) {
  const ordered = getOrderedActions(getToolbarItemActions(item));
  return { first: ordered[0] ? actionGroup(ordered[0]) : undefined, last: ordered.length ? actionGroup(ordered[ordered.length - 1]) : undefined };
}

export function getToolbarItemActionOrder(item: ToolbarItem) {
  const actions = getToolbarItemActions(item);
  return actions.length ? Math.min(...actions.map(actionOrder)) : Number.MAX_SAFE_INTEGER;
}
