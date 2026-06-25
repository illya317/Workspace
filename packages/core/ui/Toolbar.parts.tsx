"use client";

import { ActionButton } from "./ActionControls";
import { ACTION_GLYPH_ORDER_BY_KIND } from "./ActionGlyphs";
import type { ActionGlyphKind } from "./ActionGlyphs";
import { CreateStartButton } from "./CreateActionControls";
import FieldValueFilter from "./FieldValueFilter";
import { joinClassNames } from "./card-utils";
import SearchInput from "./SearchInput";
import SelectField from "./SelectField";
import ToolbarOptionGroup from "./ToolbarOptionGroup";
import type { ToolbarItem, ToolbarSection } from "./Toolbar.types";

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
        ? Math.min(...item.actions.map((action) => ACTION_GLYPH_ORDER_BY_KIND[action.kind]?.order ?? Number.MAX_SAFE_INTEGER))
        : Number.MAX_SAFE_INTEGER;
    case "edit-group": {
      const orders: number[] = [];
      if (item.canEdit !== false && !item.editMode) orders.push(ACTION_GLYPH_ORDER_BY_KIND.edit.order);
      if (item.canEdit !== false && item.editMode) {
        orders.push(ACTION_GLYPH_ORDER_BY_KIND.save.order);
        orders.push(ACTION_GLYPH_ORDER_BY_KIND.cancel.order);
      }
      if (item.canEdit !== false && item.onShowHistory) orders.push(ACTION_GLYPH_ORDER_BY_KIND.history.order);
      if (item.onDownload) orders.push(ACTION_GLYPH_ORDER_BY_KIND.download.order);
      return orders.length > 0 ? Math.min(...orders) : Number.MAX_SAFE_INTEGER;
    }
    default:
      return Number.MAX_SAFE_INTEGER;
  }
}

function renderOrderedActions(actions: ToolbarRenderableAction[], keyPrefix: string) {
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
        />
      </span>
    );
  });
}

export function ToolbarItemRenderer({ item }: { item: ToolbarItem }) {
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
          className={item.className}
          iconClassName={item.iconClassName}
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
          className={joinClassNames("!text-xs min-w-0", item.className)}
        />
      );
    }
    case "select":
      return (
        <SelectField
          value={item.value}
          options={item.options}
          onChange={item.onChange}
          placeholder={item.placeholder}
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
          dropdownHeader={(
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <span className="text-xs font-semibold text-slate-700">显示字段</span>
            </div>
          )}
          dropdownFooter={(
            <div className="border-t border-slate-100 px-3 py-2">
              <button
                type="button"
                onClick={() => onChange(defaultVisible)}
                className="w-full rounded px-2 py-1 text-center text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-50"
              >
                恢复默认
              </button>
            </div>
          )}
        />
      );
    }
    case "text":
      return (
        <span className="flex items-center text-xs font-semibold text-slate-500">
          {item.content}
        </span>
      );
    case "custom":
      return <>{item.content}</>;
    case "create":
      return (
        <CreateStartButton
          label={item.label ?? "新建"}
          active={item.active}
          disabled={item.disabled}
          onClick={item.onClick}
        />
      );
    case "action-group":
      return <>{renderOrderedActions(item.actions, item.key)}</>;
    case "edit-group": {
      const {
        editMode,
        canEdit = true,
        editLabel = "编辑",
        saveLabel = "保存",
        saving = false,
        downloading = false,
        onStartEdit,
        onSave,
        onCancel,
        onDownload,
        onShowHistory,
      } = item;
      if (!canEdit && !onDownload) return null;
      const actions: ToolbarRenderableAction[] = [];
      if (canEdit && !editMode) {
        actions.push({ key: `${item.key}-edit`, kind: "edit", label: editLabel, onClick: onStartEdit });
      }
      if (canEdit && editMode) {
        actions.push({
          key: `${item.key}-save`,
          kind: "save",
          label: saveLabel,
          variant: "primary",
          disabled: saving,
          onClick: onSave,
        });
        actions.push({ key: `${item.key}-cancel`, kind: "cancel", label: "取消", onClick: onCancel });
      }
      if (canEdit && onShowHistory) {
        actions.push({ key: `${item.key}-history`, kind: "history", label: "最近改动", onClick: onShowHistory });
      }
      if (onDownload) {
        actions.push({
          key: `${item.key}-download`,
          kind: "download",
          label: "下载",
          disabled: downloading,
          onClick: onDownload,
        });
      }
      return <>{renderOrderedActions(actions, item.key)}</>;
    }
    default:
      return null;
  }
}

export function inferSection(item: ToolbarItem): ToolbarSection {
  if (item.section) return item.section;
  switch (item.kind) {
    case "search":
      return "search";
    case "select":
    case "option-group":
    case "field-filter":
      return "filter";
    case "text":
    case "custom":
    case "column-toggle":
      return "meta";
    case "create":
      return "view";
    case "action-group":
      return "edit";
    case "edit-group":
      return "edit";
    case "icon-button":
    default:
      return "edit";
  }
}
