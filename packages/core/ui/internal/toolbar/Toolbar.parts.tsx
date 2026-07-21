"use client";

import { ActionButton } from "../action/ActionControls";
import { ACTION_GLYPH_ACTION_BY_KEY, ACTION_GLYPH_ORDER_BY_KIND, resolveActionGlyphAction } from "../action/ActionGlyphs";
import type { ActionGlyphKind } from "../action/ActionGlyphs";
import { CreateStartButton } from "../action/CreateActionControls";
import { CONTROL_SIZES, TEXT_STYLES } from "../common/interactionTokens";
import type { ControlSize } from "../common/interactionTokens";
import FieldValueFilter from "../input/FieldValueFilter";
import { StagedGroupedAutocompleteChoice } from "../input/input-surface-choice-renderers";
import SearchInput from "../input/SearchInput";
import SearchableOptionInput from "../input/SearchableOptionInput";
import { ToolbarPeriodControl } from "./ToolbarPeriodControl";
import { renderToolbarMenu, resolveToolbarOptionGroupPresentation } from "./Toolbar.menu";
import ToolbarOptionGroup from "./ToolbarOptionGroup";
import ToolbarPageSizeControl from "./ToolbarPageSizeControlParts";
import {
  getToolbarOptionInputClassName,
  TOOLBAR_FIXED_CHOICE_WIDTH_CLASS,
  TOOLBAR_FIXED_SEARCH_WIDTH_CLASS,
} from "./toolbar-styles";
import type { ToolbarActionGlyphKind, ToolbarActionKind, ToolbarItem } from "./Toolbar.types";

export function ToolbarDivider() {
  return <span aria-hidden="true" className="hidden h-6 w-px shrink-0 bg-slate-200 sm:inline-block" />;
}

export type ToolbarRenderableAction = {
  key?: string;
  label: string;
  kind: ToolbarActionKind;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
};

function getActionOrder(action: ToolbarRenderableAction) {
  return ACTION_GLYPH_ORDER_BY_KIND[resolveToolbarActionIcon(action)]?.order ?? Number.MAX_SAFE_INTEGER;
}

function getActionGroup(action: ToolbarRenderableAction) {
  return ACTION_GLYPH_ORDER_BY_KIND[resolveToolbarActionIcon(action)]?.subgroup ?? "unknown";
}

export function getOrderedActions(actions: ToolbarRenderableAction[]) {
  return [...actions].sort((a, b) => getActionOrder(a) - getActionOrder(b));
}

export function getToolbarItemActionOrder(item: ToolbarItem) {
  switch (item.kind) {
    case "icon-button":
      return ACTION_GLYPH_ORDER_BY_KIND[item.icon]?.order ?? Number.MAX_SAFE_INTEGER;
    case "action-group":
      return item.actions.length > 0
        ? Math.min(...item.actions.map((action) => ACTION_GLYPH_ORDER_BY_KIND[resolveToolbarActionIcon(action)]?.order ?? Number.MAX_SAFE_INTEGER))
        : Number.MAX_SAFE_INTEGER;
    case "edit-group": {
      const orders: number[] = [];
      if (item.canEdit !== false && !item.editMode) orders.push(ACTION_GLYPH_ORDER_BY_KIND.edit.order);
      if (item.canEdit !== false && item.editMode) {
        orders.push(ACTION_GLYPH_ORDER_BY_KIND.save.order, ACTION_GLYPH_ORDER_BY_KIND.cancel.order);
      }
      if (item.canEdit !== false && item.onShowHistory) orders.push(ACTION_GLYPH_ORDER_BY_KIND.history.order);
      if (item.onDownload) orders.push(ACTION_GLYPH_ORDER_BY_KIND.download.order);
      return orders.length > 0 ? Math.min(...orders) : Number.MAX_SAFE_INTEGER;
    }
    default:
      return Number.MAX_SAFE_INTEGER;
  }
}

function getEditGroupActions(item: Extract<ToolbarItem, { kind: "edit-group" }>): ToolbarRenderableAction[] {
  const { editMode, dirty = true, canEdit = true, editLabel = "编辑", saveLabel = "保存", saving = false, downloading = false, onStartEdit, onSave, onCancel, onDownload, onShowHistory } = item;
  const actions: ToolbarRenderableAction[] = [];
  if (canEdit && !editMode) actions.push({ key: `${item.key}-edit`, kind: "edit", label: editLabel, onClick: onStartEdit });
  if (canEdit && editMode) {
    actions.push({ key: `${item.key}-save`, kind: "save", label: saveLabel, variant: ACTION_GLYPH_ACTION_BY_KEY.save.variant, disabled: saving || !dirty, onClick: onSave });
    actions.push({ key: `${item.key}-cancel`, kind: "cancel", label: ACTION_GLYPH_ACTION_BY_KEY.cancel.label, variant: ACTION_GLYPH_ACTION_BY_KEY.cancel.variant, onClick: onCancel });
  }
  if (canEdit && onShowHistory) actions.push({ key: `${item.key}-history`, kind: "history", label: "最近改动", variant: ACTION_GLYPH_ACTION_BY_KEY.history.variant, onClick: onShowHistory });
  if (onDownload) actions.push({ key: `${item.key}-download`, kind: "download", label: ACTION_GLYPH_ACTION_BY_KEY.download.label, variant: ACTION_GLYPH_ACTION_BY_KEY.download.variant, disabled: downloading, onClick: onDownload });
  return actions;
}

export function getToolbarItemActions(item: ToolbarItem): ToolbarRenderableAction[] {
  if (item.kind === "action-group") return item.actions;
  if (item.kind === "edit-group") return getEditGroupActions(item);
  if (item.kind === "icon-button") {
    return [{ key: item.key, kind: item.icon, label: item.label, variant: item.variant, disabled: item.disabled, onClick: item.onClick, type: item.type }];
  }
  return [];
}

export function getToolbarItemActionBoundary(item: ToolbarItem) {
  const ordered = getOrderedActions(getToolbarItemActions(item));
  return {
    first: ordered[0] ? getActionGroup(ordered[0]) : undefined,
    last: ordered.length > 0 ? getActionGroup(ordered[ordered.length - 1]) : undefined,
  };
}

function renderOrderedActions(actions: ToolbarRenderableAction[], keyPrefix: string, size: ControlSize, joined = false) {
  const ordered = getOrderedActions(actions);
  return ordered.map((action, index) => {
    const previous = ordered[index - 1];
    const needsDivider = !joined && previous && getActionGroup(previous) !== getActionGroup(action);
    return (
      <span key={action.key ?? `${keyPrefix}-${index}`} className="contents">
        {needsDivider && <ToolbarDivider />}
        <ActionButton
          kind={resolveToolbarActionIcon(action)}
          label={action.label}
          type={action.type}
          variant={resolveToolbarActionVariant(action)}
          disabled={action.disabled}
          onClick={action.onClick}
          size={size}
        />
      </span>
    );
  });
}

function isToolbarActionGlyphKind(kind: ToolbarActionKind): kind is ToolbarActionGlyphKind {
  return kind in ACTION_GLYPH_ORDER_BY_KIND;
}

function resolveToolbarSemanticAction(action: ToolbarRenderableAction) {
  if (isToolbarActionGlyphKind(action.kind)) return undefined;
  return resolveActionGlyphAction({ key: action.kind, type: action.type });
}

export function resolveToolbarActionIcon(action: ToolbarRenderableAction): ActionGlyphKind {
  return resolveToolbarSemanticAction(action)?.icon ?? (action.kind as ActionGlyphKind);
}

export function resolveToolbarActionVariant(action: ToolbarRenderableAction) {
  return action.variant ?? resolveToolbarSemanticAction(action)?.variant;
}

export function ToolbarItemRenderer({ item, size = "md" }: { item: ToolbarItem; size?: ControlSize }) {
  switch (item.kind) {
    case "icon-button":
      return (
        <ActionButton
          kind={item.icon}
          label={item.label}
          type={item.type}
          variant={item.variant}
          disabled={item.disabled}
          onClick={item.onClick}
          size={size}
        />
      );
    case "panel-toggle":
      return (
        <ActionButton
          kind={item.icon}
          label={item.label}
          variant={item.variant}
          disabled={item.disabled}
          onClick={item.onClick}
          size={size}
        />
      );
    case "search": {
      const ariaLabel =
        item.ariaLabel ??
        (item.scope === "full" || !item.scope
          ? "搜索全部字段"
          : `搜索${item.scope.join("、")}`);
      return (
        <SearchInput
          value={item.value}
          onChange={item.onChange}
          placeholder={item.placeholder}
          ariaLabel={ariaLabel}
          size={size}
          widthMode="fill"
          className={TOOLBAR_FIXED_SEARCH_WIDTH_CLASS}
        />
      );
    }
    case "select":
      return (
        <SearchableOptionInput
          value={item.value}
          options={item.options}
          onChange={(next) => item.onChange(next ?? "")}
          placeholder={item.placeholder ?? item.label}
          maxResults={item.visibleCount ?? 5}
          inputClassName={getToolbarOptionInputClassName(size)}
        />
      );
    case "grouped-select":
      return (
        <StagedGroupedAutocompleteChoice
          groups={item.groups}
          value={item.value}
          disabled={item.disabled ?? false}
          placeholder={item.placeholder}
          groupLabel={item.groupLabel ?? "分类"}
          optionLabel={item.optionLabel ?? "选项"}
          emptyText="无匹配选项"
          visibleCount={item.visibleCount ?? 5}
          displayGroup
          inputClassName={getToolbarOptionInputClassName(size)}
          onChange={(next) => item.onChange(next ?? "")}
        />
      );
    case "autocomplete":
      return (
        <SearchableOptionInput
          value={item.value}
          options={(item.options ?? []).map((option) => ({
            value: option.value,
            label: option.name,
            subtitle: option.details,
            searchText: option.searchText,
            disabled: option.disabled,
          }))}
          onChange={(next) => item.onChange(next ?? "")}
          placeholder={item.placeholder}
          maxResults={item.visibleCount ?? 5}
          inputClassName={getToolbarOptionInputClassName(size)}
        />
      );
    case "label":
      return (
        <span className={`flex shrink-0 items-center whitespace-nowrap px-1 ${TEXT_STYLES.labelText}`}>
          {item.label}
        </span>
      );
    case "option-group":
      return (
        <div className="inline-flex max-w-full items-center gap-2 overflow-x-auto max-sm:w-full max-sm:justify-between">
          {item.label && <span className={TEXT_STYLES.labelText}>{item.label}</span>}
          <ToolbarOptionGroup
            value={item.value}
            options={item.options}
            onChange={item.onChange}
            ariaLabel={item.ariaLabel ?? (typeof item.label === "string" ? item.label : undefined)}
            size={size}
            presentation={item.presentation ?? resolveToolbarOptionGroupPresentation(item)}
          />
        </div>
      );
    case "field-filter":
      return (
        <FieldValueFilter
          fieldKey={item.fieldKey}
          onFieldKeyChange={item.onFieldKeyChange}
          value={item.value}
          onValueChange={item.onValueChange}
          fields={item.fields}
          valueOptions={item.valueOptions}
          placeholder={item.placeholder}
          disabled={item.disabled}
          referenceEndpoint={item.referenceEndpoint}
          size={size}
        />
      );
    case "column-toggle": {
      const { columns, visible, onChange } = item;
      const options = columns.map((column) => ({
        value: column.key,
        label: String(column.label),
        disabled: column.required,
      }));
      const defaultVisible = columns
        .filter((column) => column.required || column.defaultVisible)
        .map((column) => column.key);
      const optional = columns.filter((column) => !column.required);
      if (optional.length === 0) return null;
      return (
        <SearchableOptionInput
          multiple
          value={visible}
          options={options}
          summaryMode="count"
          onChange={onChange}
          placeholder="未选择"
          maxResults={columns.length}
          inputClassName={getToolbarOptionInputClassName(size, TOOLBAR_FIXED_CHOICE_WIDTH_CLASS)}
          dropdownAlign="right"
          dropdownMatchTriggerWidth={false}
          dropdownFooter={(
            <div className="border-t border-slate-100 px-3 py-2">
              <button
                type="button"
                onClick={() => onChange(defaultVisible)}
                className={`w-full rounded px-2 py-1 text-center ${CONTROL_SIZES[size].text} font-semibold text-emerald-700 transition hover:bg-emerald-50`}
              >
                恢复默认
              </button>
            </div>
          )}
        />
      );
    }
    case "page-size":
      return (
        <ToolbarPageSizeControl
          value={item.value}
          options={item.options}
          onChange={item.onChange}
          label={item.label}
          triggerClassName={getToolbarOptionInputClassName(size, TOOLBAR_FIXED_CHOICE_WIDTH_CLASS)}
        />
      );
    case "period":
      return <ToolbarPeriodControl item={item} size={size} />;
    case "text":
      return (
        <span className={`flex items-center ${TEXT_STYLES.labelText}`}>
          {item.content}
        </span>
      );
    case "menu":
      return renderToolbarMenu(item, size);
    case "create":
      return (
        <CreateStartButton
          label={item.label ?? "新建"}
          active={item.active}
          disabled={item.disabled}
          scrollOnCreate={item.scrollOnCreate}
          onClick={item.onClick}
          size={size}
        />
      );
    case "action-group":
      return <>{renderOrderedActions(item.actions, item.key, size, item.joined)}</>;
    case "edit-group": {
      const actions = getEditGroupActions(item);
      if (actions.length === 0) return null;
      return <>{renderOrderedActions(actions, item.key, size)}</>;
    }
    default:
      return null;
  }
}
