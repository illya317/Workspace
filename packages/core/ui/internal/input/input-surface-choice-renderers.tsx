"use client";

import { useState, type CSSProperties } from "react";
import FkFieldInput, { type FkFieldOption } from "./FkFieldInput";
import SearchableOptionInput, { type SearchableOptionInputProps } from "./SearchableOptionInput";
import {
  inputSurfaceOptionItems,
  toInputSurfaceSearchableOption,
  type InputSurfaceProps,
  type InputFieldSpec,
} from "./InputSurfaceTypes";
import type { FieldTextAlign, FieldVisualVariant } from "./TextField";
import type { SelectionOptionGroup } from "../selection/SelectionOptionTypes";
import { resolveGroupedChoiceGroupSelection } from "./grouped-choice-selection";

export type InputSurfaceChoiceRendererKind =
  | "remoteReference"
  | "autocompleteChoice";

export function isInputSurfaceChoiceRenderer(renderer: string): renderer is InputSurfaceChoiceRendererKind {
  return renderer === "remoteReference"
    || renderer === "autocompleteChoice";
}

export interface InputSurfaceChoiceRendererProps {
  renderer: InputSurfaceChoiceRendererKind;
  spec: InputFieldSpec;
  value?: unknown;
  displayValue?: string;
  stringValue: string;
  disabled: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  autocompletePresentation?: SearchableOptionInputProps["presentation"];
  onChange?: InputSurfaceProps["onChange"];
  onDismiss?: () => void;
  onQueryChange?: InputSurfaceProps["onQueryChange"];
  loading?: InputSurfaceProps["loading"];
  emptyText?: InputSurfaceProps["emptyText"];
  className?: string;
  size: NonNullable<InputSurfaceProps["size"]>;
  density: NonNullable<InputSurfaceProps["density"]>;
  style?: CSSProperties;
  visualVariant?: FieldVisualVariant;
  textAlign?: FieldTextAlign;
  fallback: () => React.ReactNode;
}

export default function InputSurfaceChoiceRenderer({
  renderer,
  spec,
  value,
  displayValue,
  stringValue,
  disabled,
  placeholder,
  autoFocus,
  autocompletePresentation,
  onChange,
  onDismiss,
  onQueryChange,
  loading,
  emptyText,
  className,
  size,
  density,
  fallback,
}: InputSurfaceChoiceRendererProps) {
  if (spec.options?.source === "grouped") {
    return (
      <StagedGroupedAutocompleteChoice
        groups={spec.options.groups}
        value={stringValue}
        disabled={disabled}
        placeholder={placeholder}
        groupLabel={spec.options.groupLabel ?? "分类"}
        optionLabel={spec.options.optionLabel ?? "选项"}
        emptyText={emptyText ?? "无匹配选项"}
        visibleCount={spec.options.visibleCount}
        autoFocus={autoFocus}
        onDismiss={onDismiss}
        onChange={(next) => onChange?.(next)}
        className={className}
      />
    );
  }

  if (renderer === "remoteReference") {
    if (spec.options?.source !== "remote") return <>{fallback()}</>;
    const options = spec.options;
    return (
      <FkFieldInput
        fkKey={options.fkKey}
        endpoint={options.endpoint}
        value={stringValue}
        displayValue={displayValue ?? stringValue}
        disabled={disabled}
        placeholder={placeholder}
        lifecycleScope={options.lifecycleScope}
        queryParams={options.queryParams}
        visibleCount={options.visibleCount ?? 5}
        dropdownPresentation={autocompletePresentation}
        autoFocus={autoFocus}
        onCancel={onDismiss}
        onChange={(label: string, option?: FkFieldOption) => {
          const next = option
            ? options.returnField === "id"
              ? String(option.id)
              : options.returnField === "subtitle"
                ? option.subtitle
                : label
            : label;
          onChange?.(next, option);
        }}
        className={className}
        size={size}
        density={density}
      />
    );
  }

  if (renderer === "autocompleteChoice") {
    const options = inputSurfaceOptionItems(spec.options).map(toInputSurfaceSearchableOption);
    if (spec.multiple) {
      const selected = Array.isArray(value) ? value.map(String) : stringValue ? [stringValue] : [];
      return (
        <SearchableOptionInput
          multiple
          value={selected}
          options={options}
          disabled={disabled}
          placeholder={placeholder}
          visibleCount={spec.options?.source === "static" ? spec.options.visibleCount : 5}
          presentation={autocompletePresentation}
          autoFocus={autoFocus}
          onOpenChange={(open) => notifyInputSurfaceDismissed(open, onDismiss)}
          onChange={(next) => onChange?.(next)}
          onQueryChange={onQueryChange}
          loading={loading}
          emptyText={emptyText}
          className={className}
        />
      );
    }
    return (
      <SearchableOptionInput
        value={stringValue}
        options={options}
        disabled={disabled}
        placeholder={placeholder}
        visibleCount={spec.options?.source === "static" ? spec.options.visibleCount : 5}
        presentation={autocompletePresentation}
        autoFocus={autoFocus}
        onOpenChange={(open) => notifyInputSurfaceDismissed(open, onDismiss)}
        onChange={(next, option) => onChange?.(next, option)}
        onQueryChange={onQueryChange}
        loading={loading}
        emptyText={emptyText}
        className={className}
      />
    );
  }

  return <>{fallback()}</>;
}

export function notifyInputSurfaceDismissed(open: boolean, onDismiss?: () => void) {
  if (!open) onDismiss?.();
}

export function StagedGroupedAutocompleteChoice({
  className,
  disabled,
  displayGroup,
  emptyText,
  groupLabel,
  groups,
  onChange,
  optionLabel,
  placeholder,
  value,
  visibleCount,
  inputClassName,
  autoFocus,
  onDismiss,
}: {
  className?: string;
  disabled: boolean;
  displayGroup?: boolean;
  emptyText: string;
  groupLabel: string;
  groups: SelectionOptionGroup[];
  onChange: (value: string | null) => void;
  optionLabel: string;
  placeholder?: string;
  value: string;
  visibleCount?: number;
  inputClassName?: string;
  autoFocus?: boolean;
  onDismiss?: () => void;
}) {
  const currentMatch = findCurrentGroupedOption(groups, value);
  const [stage, setStage] = useState<"group" | "option">("group");
  const [activeGroupKey, setActiveGroupKey] = useState(currentMatch?.group.key ?? groups[0]?.key ?? "");
  const activeGroup = groups.find((group) => group.key === activeGroupKey) ?? groups[0];
  const groupOptions = groups.map((group) => ({ value: group.key, label: group.label }));
  const displayValue = currentMatch
    ? displayGroup
      ? `${currentMatch.group.label}：${currentMatch.option.label}`
      : currentMatch.option.label
    : value;

  if (stage === "group") {
    return (
      <SearchableOptionInput
        value=""
        displayValue={displayValue}
        options={groupOptions}
        disabled={disabled}
        placeholder={placeholder ?? groupLabel}
        emptyText={emptyText}
        clearOnFocus
        autoFocus={autoFocus}
        closeOnSelect={false}
        maxResults={Math.max(2, groupOptions.length)}
        className={className}
        inputClassName={inputClassName}
        onOpenChange={(open) => notifyInputSurfaceDismissed(open, onDismiss)}
        onChange={(next) => {
          const selection = resolveGroupedChoiceGroupSelection(next);
          if (selection.kind === "clear") {
            onChange(null);
            setStage("group");
            return;
          }
          setActiveGroupKey(selection.groupKey);
          setStage("option");
        }}
      />
    );
  }

  return (
    <SearchableOptionInput
      value=""
      options={(activeGroup?.options ?? []).map(toInputSurfaceSearchableOption)}
      disabled={disabled}
      placeholder={optionLabel}
      emptyText={emptyText}
      clearOnFocus
      autoFocus
      visibleCount={visibleCount}
      className={className}
      inputClassName={inputClassName}
      onOpenChange={(open) => {
        if (!open) {
          setStage("group");
          notifyInputSurfaceDismissed(false, onDismiss);
        }
      }}
      onChange={(next) => {
        onChange(next);
        setStage("group");
      }}
    />
  );
}

function findCurrentGroupedOption(groups: SelectionOptionGroup[], value: string) {
  for (const group of groups) {
    const option = group.options.find((item) => item.value === value);
    if (option) return { group, option };
  }
  return null;
}
