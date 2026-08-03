"use client";

import { Checkbox, Radio, Rate, Select } from "antd";
import { useMemo, useState, type ReactNode } from "react";
import { joinClassNames } from "../common/card-utils";
import {
  inputSurfaceOptionItems,
  normalizeInputSurfaceValue,
  resolveInputSurfaceInteractionState,
} from "./InputSurfaceTypes";
import {
  ANTD_TAG_TOKEN_SEPARATORS,
  antdControlSize,
  AntdInputMarker,
  filterAntdChoiceOptions,
  joinAntdTagString,
  splitAntdTagString,
  toAntdChoiceOption,
  type AntdChoiceOption,
  type AntdInputFieldProps,
} from "./antd-input-shared";
import { AntdGroupedChoice } from "./antd-input-grouped";
import SearchableOptionInput from "./SearchableOptionInput";

function notifyInputSurfaceDismissed(open: boolean, onDismiss?: () => void) {
  if (!open) onDismiss?.();
}

function useInteraction(spec: AntdInputFieldProps["spec"], disabled?: boolean, readOnly?: boolean) {
  const interaction = resolveInputSurfaceInteractionState(spec.state, { disabled, readOnly });
  return { ...interaction, interactionDisabled: interaction.disabled || interaction.readOnly };
}

/** boolean(checkbox 呈现)的 antd 实现:checked/onChange(boolean) 契约与 legacy 一致。 */
export function AntdCheckboxField({
  spec,
  value,
  onChange,
  disabled: disabledOverride,
  readOnly,
  ariaLabel,
  dataFieldKey,
  title,
  className,
  style,
}: AntdInputFieldProps) {
  const { interactionDisabled } = useInteraction(spec, disabledOverride, readOnly);
  return (
    <AntdInputMarker className={className} dataFieldKey={dataFieldKey} style={style} title={title}>
      <Checkbox
        checked={Boolean(value)}
        disabled={interactionDisabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange?.(event.target.checked)}
      />
    </AntdInputMarker>
  );
}

/**
 * boolean/choice 的 choice 呈现:radio → Radio.Group,multiple → Checkbox.Group。
 * legacy 的 onChange 契约:radio 输出选中值,checkbox 按 options 顺序以「,」连接。
 */
export function AntdChoiceGroupField({
  spec,
  value,
  onChange,
  choiceType,
  choiceName,
  disabled: disabledOverride,
  readOnly,
  dataFieldKey,
  title,
  className,
  style,
}: AntdInputFieldProps) {
  const { interactionDisabled } = useInteraction(spec, disabledOverride, readOnly);
  const options = inputSurfaceOptionItems(spec.options).map((option) => String(option.value));
  const stringValue = normalizeInputSurfaceValue(value);
  const type = choiceType ?? (spec.multiple ? "checkbox" : "radio");
  if (type === "checkbox") {
    const selected = new Set(stringValue.split(",").map((item) => item.trim()).filter(Boolean));
    return (
      <AntdInputMarker className={className} dataFieldKey={dataFieldKey} style={style} title={title}>
        <Checkbox.Group
          options={options}
          value={options.filter((option) => selected.has(option))}
          disabled={interactionDisabled}
          onChange={(next) => {
            const nextSet = new Set(next.map(String));
            onChange?.(options.filter((option) => nextSet.has(option)).join(","));
          }}
        />
      </AntdInputMarker>
    );
  }
  return (
    <AntdInputMarker className={className} dataFieldKey={dataFieldKey} style={style} title={title}>
      <Radio.Group
        options={options}
        name={choiceName}
        value={stringValue}
        disabled={interactionDisabled}
        onChange={(event) => onChange?.(String(event.target.value))}
      />
    </AntdInputMarker>
  );
}

/** rating 的 antd 实现:label 文本保留;allowClear=false 保持 legacy「重复点击同分值仍提交同值」的语义。 */
export function AntdRatingField({
  value,
  onChange,
  placeholder,
  ratingLabel,
  ratingMax,
  showRatingLabel,
  spec,
  disabled: disabledOverride,
  readOnly,
  dataFieldKey,
  title,
  className,
  style,
}: AntdInputFieldProps) {
  const { interactionDisabled } = useInteraction(spec, disabledOverride, readOnly);
  const label = ratingLabel ?? placeholder ?? "评分";
  const numeric = value === null || value === undefined || value === "" ? 0 : Number(value);
  return (
    <div
      className={joinClassNames("flex items-center gap-2", className)}
      data-field-key={dataFieldKey}
      data-ui-renderer="antd"
      style={style}
      title={title}
    >
      {(showRatingLabel ?? true) ? <span className="text-xs font-medium text-slate-500">{label}</span> : null}
      <Rate
        value={Number.isFinite(numeric) ? numeric : 0}
        count={ratingMax ?? 5}
        disabled={interactionDisabled}
        allowClear={false}
        aria-label={label}
        onChange={(next) => onChange?.(next)}
      />
    </div>
  );
}

/** collection(tags)的 antd 实现:值契约保持「、」连接字符串,tokenSeparators 与 legacy 分隔键一致。 */
export function AntdTagsField({
  spec,
  value,
  onChange,
  placeholder,
  size,
  density,
  disabled: disabledOverride,
  readOnly,
  ariaLabel,
  dataFieldKey,
  title,
  className,
  style,
}: AntdInputFieldProps) {
  const { interactionDisabled } = useInteraction(spec, disabledOverride, readOnly);
  return (
    <AntdInputMarker className={className} dataFieldKey={dataFieldKey} density={density} style={style} title={title}>
      <Select
        mode="tags"
        value={splitAntdTagString(normalizeInputSurfaceValue(value))}
        disabled={interactionDisabled}
        placeholder={placeholder ?? "添加别名"}
        size={antdControlSize(size)}
        aria-label={ariaLabel}
        tokenSeparators={ANTD_TAG_TOKEN_SEPARATORS}
        onChange={(next) => onChange?.(joinAntdTagString(next.map(String)))}
      />
    </AntdInputMarker>
  );
}

/**
 * choice(autocomplete 呈现)的 antd 实现:
 * - static:沿用 legacy 的 matchText 直接/模糊命中规则自行过滤并按 visibleCount 截断(showSearch.filterOption=false);
 * - grouped:keeps the public two-stage groupLabel → optionLabel protocol as a dedicated leaf;
 * - searchText/subtitle/disabled/emptyText/loading/onQueryChange/onDismiss/displayValue 全部保留。
 */
export function AntdAutocompleteChoice({
  spec,
  value,
  displayValue,
  onChange,
  onDismiss,
  onQueryChange,
  loading,
  emptyText,
  placeholder,
  autoFocus,
  autocompletePresentation,
  size,
  density,
  disabled: disabledOverride,
  readOnly,
  ariaLabel,
  dataFieldKey,
  title,
  className,
  style,
}: AntdInputFieldProps) {
  const { interactionDisabled } = useInteraction(spec, disabledOverride, readOnly);
  const multiple = Boolean(spec.multiple);
  const [search, setSearch] = useState("");
  const stringValue = normalizeInputSurfaceValue(value);
  const allOptions = useMemo(
    () => inputSurfaceOptionItems(spec.options).map(toAntdChoiceOption),
    [spec.options],
  );
  const groups = spec.options?.source === "grouped" ? spec.options.groups : null;
  const visibleCount = spec.options?.source === "static" ? spec.options.visibleCount : undefined;
  const filtered = useMemo(
    () => filterAntdChoiceOptions(allOptions, search, visibleCount),
    [allOptions, search, visibleCount],
  );
  const antdOptions: AntdChoiceOption[] = filtered;
  const selected = multiple
    ? Array.isArray(value) ? value.map(String) : stringValue ? [stringValue] : []
    : stringValue || undefined;
  if (groups) {
    return (
      <AntdInputMarker className={className} dataFieldKey={dataFieldKey} density={density} style={style} title={title}>
        <AntdGroupedChoice
          autoFocus={autoFocus}
          className="w-full"
          disabled={interactionDisabled}
          emptyText={emptyText ?? "无匹配选项"}
          groupLabel={spec.options?.source === "grouped" ? spec.options.groupLabel ?? "分类" : "分类"}
          groups={groups}
          onChange={(next) => onChange?.(next)}
          onDismiss={onDismiss}
          optionLabel={spec.options?.source === "grouped" ? spec.options.optionLabel ?? "选项" : "选项"}
          placeholder={placeholder}
          value={stringValue}
          visibleCount={spec.options?.source === "grouped" ? spec.options.visibleCount : undefined}
        />
      </AntdInputMarker>
    );
  }
  if (autocompletePresentation === "inline") {
    const inlineOptions = allOptions.map((option) => ({
      value: option.value,
      label: option.label,
      disabled: option.disabled,
      searchText: option.searchText,
      subtitle: option.subtitle,
    }));
    const common = {
      autoFocus,
      disabled: interactionDisabled,
      displayValue,
      emptyText: emptyText ?? "无匹配选项",
      loading,
      onOpenChange: (open: boolean) => notifyInputSurfaceDismissed(open, onDismiss),
      onQueryChange,
      options: inlineOptions,
      placeholder: placeholder ?? "未设置",
      presentation: "inline" as const,
      visibleCount,
    };
    return (
      <AntdInputMarker className={className} dataFieldKey={dataFieldKey} density={density} style={style} title={title}>
        {multiple ? (
          <SearchableOptionInput {...common} multiple value={Array.isArray(value) ? value : []} onChange={(next) => onChange?.(next)} />
        ) : (
          <SearchableOptionInput {...common} value={stringValue} onChange={(next, option) => onChange?.(next, option)} />
        )}
      </AntdInputMarker>
    );
  }
  return (
    <AntdInputMarker className={className} dataFieldKey={dataFieldKey} density={density} style={style} title={title}>
      <Select
        mode={multiple ? "multiple" : undefined}
        showSearch={{
          filterOption: false,
          onSearch: (query) => {
            setSearch(query);
            onQueryChange?.(query);
          },
        }}
        value={selected}
        options={antdOptions}
        disabled={interactionDisabled}
        placeholder={placeholder ?? "未设置"}
        size={antdControlSize(size)}
        autoFocus={autoFocus}
        loading={loading}
        allowClear
        aria-label={ariaLabel}
        notFoundContent={emptyText ?? "无匹配选项"}
        optionRender={(item) => {
          const data = item.data as AntdChoiceOption;
          if (Array.isArray((data as { options?: unknown }).options)) return data.label as ReactNode;
          return (
            <span title={data.hoverText}>
              {data.label}
              {data.subtitle ? <span className="ml-2 text-xs text-slate-400">{data.subtitle}</span> : null}
            </span>
          );
        }}
        labelRender={(renderProps) => {
          const matched = allOptions.find((option) => option.value === String(renderProps.value));
          return matched?.label ?? displayValue ?? (renderProps.label as ReactNode) ?? String(renderProps.value ?? "");
        }}
        onOpenChange={(open) => {
          if (!open) setSearch("");
          notifyInputSurfaceDismissed(open, onDismiss);
        }}
        onChange={(next, option) => {
          setSearch("");
          if (multiple) onChange?.((next as string[]).map(String), option);
          else onChange?.(next === undefined ? null : String(next), option);
        }}
      />
    </AntdInputMarker>
  );
}
