"use client";

import type { CSSProperties } from "react";
import FkFieldInput, { type FkFieldOption } from "./FkFieldInput";
import OptionPicker from "../selection/OptionPicker";
import SearchableOptionInput, { type SearchableOptionInputProps } from "./SearchableOptionInput";
import SelectField from "./SelectField";
import {
  inputControlOptionItems,
  toInputControlSearchableOption,
  type InputControlProps,
  type InputFieldSpec,
} from "./InputControlTypes";
import type { FieldTextAlign, FieldVisualVariant } from "./TextField";

export type InputControlChoiceRendererKind =
  | "remoteReference"
  | "autocompleteChoice"
  | "selectChoice"
  | "pickerChoice";

export function isInputControlChoiceRenderer(renderer: string): renderer is InputControlChoiceRendererKind {
  return renderer === "remoteReference"
    || renderer === "autocompleteChoice"
    || renderer === "selectChoice"
    || renderer === "pickerChoice";
}

export interface InputControlChoiceRendererProps {
  renderer: InputControlChoiceRendererKind;
  spec: InputFieldSpec;
  value?: unknown;
  displayValue?: string;
  stringValue: string;
  disabled: boolean;
  placeholder?: string;
  autocompletePresentation?: SearchableOptionInputProps["presentation"];
  onChange?: InputControlProps["onChange"];
  onQueryChange?: InputControlProps["onQueryChange"];
  loading?: InputControlProps["loading"];
  emptyText?: InputControlProps["emptyText"];
  className?: string;
  size: NonNullable<InputControlProps["size"]>;
  density: NonNullable<InputControlProps["density"]>;
  style?: CSSProperties;
  visualVariant?: FieldVisualVariant;
  textAlign?: FieldTextAlign;
  fallback: () => React.ReactNode;
}

export default function InputControlChoiceRenderer({
  renderer,
  spec,
  value,
  displayValue,
  stringValue,
  disabled,
  placeholder,
  autocompletePresentation,
  onChange,
  onQueryChange,
  loading,
  emptyText,
  className,
  size,
  density,
  style,
  visualVariant,
  textAlign,
  fallback,
}: InputControlChoiceRendererProps) {
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
    return (
      <SearchableOptionInput
        value={stringValue}
        options={inputControlOptionItems(spec.options).map(toInputControlSearchableOption)}
        disabled={disabled}
        placeholder={placeholder}
        maxResults={spec.options?.source === "static" || spec.options?.source === "grouped" ? spec.options.visibleCount ?? 5 : 5}
        presentation={autocompletePresentation}
        onChange={(next, option) => onChange?.(next, option)}
        onQueryChange={onQueryChange}
        loading={loading}
        emptyText={emptyText}
        className={className}
      />
    );
  }

  if (renderer === "selectChoice" && (spec.options?.source === "static" || spec.options?.source === "grouped")) {
    const options = inputControlOptionItems(spec.options);
    if (spec.multiple) {
      const selected = Array.isArray(value) ? value.map(String) : stringValue ? [stringValue] : [];
      return (
        <SelectField
          multiple
          value={selected}
          options={options}
          disabled={disabled}
          placeholder={placeholder}
          searchable={options.length > 8}
          onChange={(next) => onChange?.(next)}
          className={className}
          style={style}
          visualVariant={visualVariant === "paperUnderline" ? "paperUnderline" : undefined}
          textAlign={textAlign}
          size={size}
          density={density}
        />
      );
    }
    return (
      <SelectField
        value={stringValue}
        options={options}
        disabled={disabled}
        placeholder={placeholder}
        searchable={options.length > 8}
        onChange={(next) => onChange?.(next)}
        className={className}
        style={style}
        visualVariant={visualVariant === "paperUnderline" ? "paperUnderline" : undefined}
        textAlign={textAlign}
        size={size}
        density={density}
      />
    );
  }

  if (spec.options?.source === "grouped") {
    return (
      <OptionPicker
        value={stringValue}
        groups={spec.options.groups}
        disabled={disabled}
        placeholder={placeholder}
        unsetLabel={spec.options.unsetLabel}
        groupLabel={spec.options.groupLabel}
        optionLabel={spec.options.optionLabel}
        changeGroupLabel={spec.options.changeGroupLabel}
        searchPlaceholder={spec.options.searchPlaceholder}
        visibleCount={spec.options.visibleCount ?? 8}
        onChange={(next) => onChange?.(next)}
        className={className}
      />
    );
  }

  return (
    <OptionPicker
      value={stringValue}
      options={inputControlOptionItems(spec.options)}
      disabled={disabled}
      placeholder={placeholder}
      unsetLabel={spec.options?.source === "static" ? spec.options.unsetLabel : undefined}
      commonValues={spec.options?.source === "static" ? spec.options.commonValues : undefined}
      searchPlaceholder={spec.options?.source === "static" ? spec.options.searchPlaceholder : undefined}
      visibleCount={spec.options?.source === "static" ? spec.options.visibleCount ?? 8 : 8}
      onChange={(next) => onChange?.(next)}
      className={className}
    />
  );
}
