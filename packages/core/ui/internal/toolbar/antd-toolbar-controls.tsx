"use client";

import { useMemo, useState } from "react";
import { Button, DatePicker, Dropdown, Input, Segmented, Select } from "antd";
import dayjs from "dayjs";
import { matchText } from "../../../search";
import { ActionGlyph } from "../action/ActionGlyphs";
import { joinClassNames } from "../common/card-utils";
import { CONTROL_SIZES, TEXT_STYLES } from "../common/interactionTokens";
import type { ControlSize } from "../common/interactionTokens";
import { antdControlSize, listHeightFromVisibleCount } from "./antd-toolbar-shared";
import { resolveToolbarOptionGroupPresentation } from "./Toolbar.menu";
import FieldValueFilter from "../input/FieldValueFilter";
import { AntdGroupedChoice } from "../input/antd-input-grouped";
import { ToolbarPeriodControl } from "./ToolbarPeriodControl";
import {
  TOOLBAR_DEFAULT_AUTOCOMPLETE_WIDTH_CLASS,
  TOOLBAR_FIXED_CHOICE_WIDTH_CLASS,
  TOOLBAR_FIXED_SEARCH_WIDTH_CLASS,
  getToolbarOptionInputClassName,
} from "./toolbar-styles";
import type {
  ToolbarAutocompleteItem,
  ToolbarColumnToggleItem,
  ToolbarFieldFilterItem,
  ToolbarGroupedSelectItem,
  ToolbarOptionGroupItem,
  ToolbarPageSizeItem,
  ToolbarPeriodItem,
  ToolbarSearchItem,
  ToolbarSelectItem,
} from "./Toolbar.types";

type AntdAutocompleteOption = {
  value: string;
  label: string;
  disabled?: boolean;
  details?: string;
  searchText?: string;
};

function matchesAutocompleteOption(input: string, option?: AntdAutocompleteOption) {
  if (!option) return false;
  return matchText(option.label, input)
    || matchText(option.value, input)
    || matchText(`${option.details ?? ""} ${option.searchText ?? ""}`, input);
}

export function filterToolbarAutocompleteOptions(options: AntdAutocompleteOption[], input: string, visibleCount?: number) {
  const limit = visibleCount ?? (options.length > 0 && options.length < 10 ? options.length : 5);
  if (!input.trim()) return options.slice(0, limit);
  const direct: AntdAutocompleteOption[] = [];
  const fuzzy: AntdAutocompleteOption[] = [];
  for (const option of options) {
    if (matchText(option.label, input) || matchText(option.value, input)) direct.push(option);
    else if (matchesAutocompleteOption(input, option)) fuzzy.push(option);
    if (direct.length + fuzzy.length >= limit) break;
  }
  return [...direct, ...fuzzy].slice(0, limit);
}

export function AntdToolbarSearch({
  item,
  size,
}: {
  item: ToolbarSearchItem;
  size: ControlSize;
}) {
  // Preserve the previous renderer's aria-label derivation.
  const ariaLabel =
    item.ariaLabel ??
    (item.scope === "full" || !item.scope ? "搜索全部字段" : `搜索${item.scope.join("、")}`);
  return (
    <span className={joinClassNames("inline-flex", TOOLBAR_FIXED_SEARCH_WIDTH_CLASS)}>
      <Input
        aria-label={ariaLabel}
        onChange={(event) => item.onChange(event.target.value)}
        placeholder={item.placeholder ?? "搜索..."}
        prefix={<ActionGlyph kind="search" className="size-4 text-slate-400" />}
        size={antdControlSize(size)}
        value={item.value}
      />
    </span>
  );
}

export function AntdToolbarSelect({
  item,
  size,
}: {
  item: ToolbarSelectItem;
  size: ControlSize;
}) {
  const [search, setSearch] = useState("");
  const allOptions = useMemo<AntdAutocompleteOption[]>(() => item.options.map((option) => ({
    value: option.value,
    label: option.label,
    disabled: option.disabled,
    details: option.subtitle,
    searchText: option.searchText,
  })), [item.options]);
  const options = item.searchable
    ? filterToolbarAutocompleteOptions(allOptions, search, item.visibleCount)
    : allOptions;
  return (
    <span className={joinClassNames("inline-flex", TOOLBAR_DEFAULT_AUTOCOMPLETE_WIDTH_CLASS)}>
      <Select
        allowClear
        aria-label={item.label ?? item.placeholder}
        className="w-full"
        listHeight={listHeightFromVisibleCount(item.visibleCount)}
        labelRender={(renderProps) => allOptions.find((option) => option.value === String(renderProps.value))?.label ?? renderProps.label}
        onChange={(value?: string) => { setSearch(""); item.onChange(value ?? ""); }}
        onOpenChange={(open) => { if (!open) setSearch(""); }}
        optionRender={(originOption) => {
          const data = originOption.data as AntdAutocompleteOption;
          return <span className="block min-w-0 truncate" title={data.details}>{data.label}</span>;
        }}
        options={options}
        placeholder={item.placeholder ?? item.label}
        popupMatchSelectWidth={false}
        showSearch={item.searchable ? { filterOption: false, onSearch: setSearch } : false}
        size={antdControlSize(size)}
        value={item.value || undefined}
      />
    </span>
  );
}

export function AntdToolbarAutocomplete({
  item,
  size,
}: {
  item: ToolbarAutocompleteItem;
  size: ControlSize;
}) {
  const [search, setSearch] = useState("");
  const allOptions: AntdAutocompleteOption[] = useMemo(() => item.options.map((option) => ({
    value: option.value,
    label: option.name,
    disabled: option.disabled,
    details: option.details,
    searchText: option.searchText,
  })), [item.options]);
  const options = useMemo(
    () => filterToolbarAutocompleteOptions(allOptions, search, item.visibleCount),
    [allOptions, item.visibleCount, search],
  );
  return (
    <span className={joinClassNames("inline-flex", TOOLBAR_DEFAULT_AUTOCOMPLETE_WIDTH_CLASS)}>
      <Select
        allowClear
        aria-label={item.ariaLabel ?? item.placeholder}
        className="w-full"
        listHeight={listHeightFromVisibleCount(item.visibleCount)}
        labelRender={(renderProps) => allOptions.find((option) => option.value === String(renderProps.value))?.label ?? renderProps.label}
        onChange={(value?: string) => { setSearch(""); item.onChange(value ?? ""); }}
        onOpenChange={(open) => { if (!open) setSearch(""); }}
        optionRender={(originOption) => {
          const data = originOption.data as AntdAutocompleteOption;
          return <span className="block min-w-0 truncate" title={data.details}>{data.label}</span>;
        }}
        options={options}
        placeholder={item.placeholder}
        popupMatchSelectWidth={false}
        showSearch={{
          filterOption: false,
          onSearch: setSearch,
        }}
        size={antdControlSize(size)}
        value={item.value || undefined}
      />
    </span>
  );
}

export function AntdToolbarOptionGroup({
  item,
  size,
}: {
  item: ToolbarOptionGroupItem;
  size: ControlSize;
}) {
  const presentation = item.presentation ?? resolveToolbarOptionGroupPresentation(item);
  const ariaLabel = item.ariaLabel ?? (typeof item.label === "string" ? item.label : undefined);
  if (presentation === "accordion") {
    return <AntdToolbarAccordion item={item} size={size} ariaLabel={ariaLabel} />;
  }
  return (
    <div className="inline-flex max-w-full items-center gap-2 overflow-x-auto max-sm:w-full max-sm:justify-between">
      {item.label ? <span className={TEXT_STYLES.labelText}>{item.label}</span> : null}
      <div role="group" aria-label={ariaLabel}>
        <Segmented
          onChange={(value) => item.onChange(String(value))}
          options={item.options.map((option) => ({
            value: option.value,
            label: option.label,
            disabled: option.disabled,
          }))}
          size={antdControlSize(size)}
          value={item.value}
        />
      </div>
    </div>
  );
}

export function resolveAntdToolbarAccordionModel(item: ToolbarOptionGroupItem, ariaLabel?: string) {
  const defaultOption = item.options[0];
  const activeOption = item.options.find((option) => option.value === item.value);
  const activeTrigger = item.accordionTrigger === "active";
  const triggerOption = activeTrigger ? activeOption ?? defaultOption : defaultOption;
  return {
    activeTrigger,
    triggerOption,
    triggerLabel: activeTrigger
      ? triggerOption?.label
      : item.value === defaultOption?.value
        ? ariaLabel ?? defaultOption?.label
        : activeOption?.label ?? ariaLabel ?? defaultOption?.label,
    menuOptions: activeTrigger
      ? item.options.filter((option) => option.value !== triggerOption?.value)
      : item.options.slice(1),
    disabled: !triggerOption || Boolean(triggerOption.disabled),
  };
}

export function activateAntdToolbarAccordionTrigger(item: ToolbarOptionGroupItem, ariaLabel?: string) {
  const model = resolveAntdToolbarAccordionModel(item, ariaLabel);
  if (!model.disabled && !model.activeTrigger && model.triggerOption) item.onChange(model.triggerOption.value);
}

function AntdToolbarAccordion({ item, size, ariaLabel }: {
  item: ToolbarOptionGroupItem;
  size: ControlSize;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const model = resolveAntdToolbarAccordionModel(item, ariaLabel);
  return (
    <div className="inline-flex max-w-full items-center gap-2">
      {item.label ? <span className={TEXT_STYLES.labelText}>{item.label}</span> : null}
      <Dropdown
        disabled={model.disabled}
        menu={{
          items: model.menuOptions.map((option) => ({ key: option.value, label: option.label, disabled: option.disabled })),
          onClick: ({ key }) => { item.onChange(key); setOpen(false); },
          selectedKeys: item.value ? [item.value] : [],
        }}
        onOpenChange={setOpen}
        open={open}
        trigger={["click"]}
      >
        <Button
          aria-label={ariaLabel}
          data-accordion-trigger={model.activeTrigger ? "active" : "default"}
          disabled={model.disabled}
          onClick={() => activateAntdToolbarAccordionTrigger(item, ariaLabel)}
          size={antdControlSize(size)}
        >
          {model.triggerLabel}<span aria-hidden="true">⌄</span>
        </Button>
      </Dropdown>
    </div>
  );
}

export function AntdToolbarPageSize({
  item,
  size,
}: {
  item: ToolbarPageSizeItem;
  size: ControlSize;
}) {
  const label = item.label ?? "每页条数";
  return (
    <span className={joinClassNames("inline-flex", TOOLBAR_FIXED_CHOICE_WIDTH_CLASS)}>
      <Select
        aria-label={label}
        className="w-full"
        onChange={(value: string) => item.onChange(value)}
        options={item.options.map((option) => ({
          value: option.value,
          label: option.label,
          disabled: option.disabled,
        }))}
        placeholder={label}
        popupMatchSelectWidth={false}
        size={antdControlSize(size)}
        value={item.value || undefined}
      />
    </span>
  );
}

export function AntdToolbarColumnToggle({
  item,
  size,
}: {
  item: ToolbarColumnToggleItem;
  size: ControlSize;
}) {
  const { columns, visible, onChange } = item;
  const optional = columns.filter((column) => !column.required);
  // 与 legacy 一致:没有可选列时不渲染。
  if (optional.length === 0) return null;
  const defaultVisible = columns
    .filter((column) => column.required || column.defaultVisible)
    .map((column) => column.key);
  const options = columns.map((column) => ({
    value: column.key,
    label: String(column.label),
    disabled: column.required,
  }));
  return (
    <span className={joinClassNames("inline-flex", TOOLBAR_FIXED_CHOICE_WIDTH_CLASS)}>
      <Select
        aria-label="显示列"
        className="w-full"
        maxTagCount={0}
        // 与 legacy summaryMode="count" 的 "n/m" 汇总文案一致。
        maxTagPlaceholder={() => `${visible.length}/${options.length}`}
        mode="multiple"
        onChange={(values: string[]) => onChange(values)}
        options={options}
        placeholder="未选择"
        popupMatchSelectWidth={false}
        popupRender={(menu) => (
          <>
            {menu}
            <div className="border-t border-slate-100 px-3 py-2">
              <button
                type="button"
                onClick={() => onChange(defaultVisible)}
                className={`w-full rounded px-2 py-1 text-center ${CONTROL_SIZES[size].text} font-semibold text-emerald-700 transition hover:bg-emerald-50`}
              >
                恢复默认
              </button>
            </div>
          </>
        )}
        size={antdControlSize(size)}
        value={visible}
      />
    </span>
  );
}

export function AntdToolbarPeriod({
  item,
  size,
}: {
  item: ToolbarPeriodItem;
  size: ControlSize;
}) {
  // Navigation periods keep their dedicated date-navigation protocol as an Ant-dispatched leaf.
  if (item.mode === "nav") return <span data-ui-renderer="antd"><ToolbarPeriodControl item={item} size={size} /></span>;
  const format = item.mode === "month" ? "YYYY-MM" : "YYYY-MM-DD";
  const placeholder = item.placeholder ?? (item.mode === "month" ? "选择月份" : "选择日期");
  return (
    <DatePicker
      allowClear
      aria-label={placeholder}
      className={item.mode === "month" ? "!w-[9rem] shrink-0" : "!w-[7.5rem] shrink-0"}
      disabled={item.disabled}
      format={format}
      onChange={(date) => item.onChange(date ? date.format(format) : null)}
      picker={item.mode}
      placeholder={placeholder}
      size={antdControlSize(size)}
      value={item.value ? dayjs(item.value) : null}
    />
  );
}

export function AntdToolbarGroupedSelect({ item, size }: { item: ToolbarGroupedSelectItem; size: ControlSize }) {
  return (
    <span className={joinClassNames("inline-flex", TOOLBAR_DEFAULT_AUTOCOMPLETE_WIDTH_CLASS)}>
      <AntdGroupedChoice
        disabled={Boolean(item.disabled)}
        displayGroup
        emptyText="无匹配选项"
        groupLabel={item.groupLabel ?? "分类"}
        groups={item.groups}
        inputClassName={getToolbarOptionInputClassName(size)}
        onChange={(next) => item.onChange(next ?? "")}
        optionLabel={item.optionLabel ?? "选项"}
        placeholder={item.placeholder}
        value={item.value}
        visibleCount={item.visibleCount}
      />
    </span>
  );
}

export function AntdToolbarFieldFilter({ item, size }: { item: ToolbarFieldFilterItem; size: ControlSize }) {
  return (
    <span data-ui-renderer="antd">
      <FieldValueFilter
        disabled={item.disabled}
        fieldKey={item.fieldKey}
        fields={item.fields}
        onFieldKeyChange={item.onFieldKeyChange}
        onValueChange={item.onValueChange}
        placeholder={item.placeholder}
        referenceEndpoint={item.referenceEndpoint}
        size={size}
        value={item.value}
        valueOptions={item.valueOptions}
      />
    </span>
  );
}
