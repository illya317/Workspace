"use client";

import { ActionButton } from "./ActionControls";
import { ACTION_GLYPH_ORDER_BY_KIND } from "./ActionGlyphs";
import type { ActionGlyphKind } from "./ActionGlyphs";
import { CreateStartButton } from "./CreateActionControls";
import { CONTROL_SIZES, TEXT_STYLES } from "./interactionTokens";
import type { ControlSize } from "./interactionTokens";
import FieldValueFilter from "./FieldValueFilter";
import SearchInput from "./SearchInput";
import SelectField from "./SelectField";
import { ToolbarPeriodControl } from "./ToolbarPeriodControl";
import ToolbarOptionGroup from "./ToolbarOptionGroup";
import type { ToolbarItem } from "./Toolbar.types";

export function ToolbarDivider() {
  return <span aria-hidden="true" className="hidden h-6 w-px shrink-0 bg-slate-200 sm:inline-block" />;
}

type ToolbarRenderableAction = {
  key?: string;
  label: string;
  kind: ActionGlyphKind;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
};

function getActionOrder(action: ToolbarRenderableAction) {
  return ACTION_GLYPH_ORDER_BY_KIND[action.kind]?.order ?? Number.MAX_SAFE_INTEGER;
}

function getActionGroup(action: ToolbarRenderableAction) {
  return ACTION_GLYPH_ORDER_BY_KIND[action.kind]?.group ?? "unknown";
}

function getOrderedActions(actions: ToolbarRenderableAction[]) {
  return [...actions].sort((a, b) => getActionOrder(a) - getActionOrder(b));
}

export function getToolbarItemActionOrder(item: ToolbarItem) {
  switch (item.kind) {
    case "icon-button":
      return ACTION_GLYPH_ORDER_BY_KIND[item.icon]?.order ?? Number.MAX_SAFE_INTEGER;
    case "action-group":
      return item.actions.length > 0
        ? Math.min(...item.actions.map((a) => ACTION_GLYPH_ORDER_BY_KIND[a.kind]?.order ?? Number.MAX_SAFE_INTEGER))
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

function renderOrderedActions(actions: ToolbarRenderableAction[], keyPrefix: string, size: ControlSize) {
  const ordered = getOrderedActions(actions);
  return ordered.map((action, index) => {
    const previous = ordered[index - 1];
    const needsDivider = previous && getActionGroup(previous) !== getActionGroup(action);
    return (
      <span key={action.key ?? `${keyPrefix}-${index}`} className="contents">
        {needsDivider && <ToolbarDivider />}
        <ActionButton
          kind={action.kind}
          label={action.label}
          type={action.type}
          variant={action.variant}
          disabled={action.disabled}
          onClick={action.onClick}
          size={size}
        />
      </span>
    );
  });
}

export function ToolbarItemRenderer({ item, size = "md" }: { item: ToolbarItem; size?: ControlSize }) {
  switch (item.kind) {
    case "icon-button":
    case "panel-toggle":
      return (
        <ActionButton
          kind={item.icon}
          label={item.label}
          type={item.kind === "icon-button" ? item.type : undefined}
          variant={item.variant}
          disabled={item.disabled}
          onClick={item.onClick}
          className={item.className}
          iconClassName={item.iconClassName}
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
          className={item.className}
        />
      );
    }
    case "select":
      return (
        <SelectField
          label={item.label}
          value={item.value}
          options={item.options}
          onChange={item.onChange}
          placeholder={item.placeholder}
          size={size}
          appearance="toolbar"
          className={item.className}
          triggerClassName={item.triggerClassName}
        />
      );
    case "option-group":
      return (
        <ToolbarOptionGroup
          value={item.value}
          options={item.options}
          onChange={item.onChange}
          ariaLabel={item.ariaLabel}
          size={size}
          presentation={item.presentation ?? "accordion"}
          defaultExpanded={item.defaultExpanded}
        />
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
        <SelectField
          multiple
          summaryMode="count"
          label="字段"
          options={options}
          value={visible}
          onChange={onChange}
          placeholder="未选择"
          size={size}
          appearance="toolbar"
          dropdownHeader={(
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <span className={`${CONTROL_SIZES[size].text} font-semibold text-slate-700`}>显示字段</span>
            </div>
          )}
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
        <SelectField
          label={item.label}
          value={item.value}
          options={item.options}
          onChange={item.onChange}
          size={size}
          appearance="toolbar"
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
    case "create":
      return (
        <CreateStartButton
          label={item.label ?? "新建"}
          active={item.active}
          disabled={item.disabled}
          onClick={item.onClick}
          size={size}
        />
      );
    case "action-group":
      return <>{renderOrderedActions(item.actions, item.key, size)}</>;
    case "edit-group": {
      const { editMode, canEdit = true, editLabel = "编辑", saveLabel = "保存", saving = false, downloading = false, onStartEdit, onSave, onCancel, onDownload, onShowHistory } = item;
      if (!canEdit && !onDownload) return null;
      const actions: ToolbarRenderableAction[] = [];
      if (canEdit && !editMode) actions.push({ key: `${item.key}-edit`, kind: "edit", label: editLabel, onClick: onStartEdit });
      if (canEdit && editMode) {
        actions.push({ key: `${item.key}-save`, kind: "save", label: saveLabel, variant: "primary", disabled: saving, onClick: onSave });
        actions.push({ key: `${item.key}-cancel`, kind: "cancel", label: "取消", onClick: onCancel });
      }
      if (canEdit && onShowHistory) actions.push({ key: `${item.key}-history`, kind: "history", label: "最近改动", onClick: onShowHistory });
      if (onDownload) actions.push({ key: `${item.key}-download`, kind: "download", label: "下载", disabled: downloading, onClick: onDownload });
      return <>{renderOrderedActions(actions, item.key, size)}</>;
    }
    default:
      return null;
  }
}
