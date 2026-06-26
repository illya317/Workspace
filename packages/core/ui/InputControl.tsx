"use client";

import type { ReactNode } from "react";
import CalendarDateInput from "./CalendarDateInput";
import CheckboxField from "./CheckboxField";
import FileField from "./FileField";
import FkFieldInput, { type FkFieldOption, type LifecycleScope } from "./FkFieldInput";
import type { FieldControlSize } from "./FormStyles";
import OptionPicker from "./OptionPicker";
import type { PickerGroupItem, PickerOption } from "./OptionPickerTypes";
import PercentField from "./PercentField";
import ReadOnlyField from "./ReadOnlyField";
import SearchableOptionInput, { type SearchableOption } from "./SearchableOptionInput";
import SwitchField from "./SwitchField";
import TagStringInput from "./TagStringInput";
import TextareaField from "./TextareaField";
import TextField from "./TextField";
import TimeField from "./TimeField";

export type InputValueType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "time"
  | "datetime"
  | "file"
  | "reference"
  | "array";

export type InputEditor =
  | "input"
  | "textarea"
  | "number"
  | "select"
  | "multiSelect"
  | "tags"
  | "autocomplete"
  | "switch"
  | "checkbox"
  | "datePicker"
  | "timePicker"
  | "upload"
  | "filterPanel"
  | "maskedInput";

export type InputOption = PickerOption & { searchText?: string; subtitle?: string };
export type InputOptionGroup = PickerGroupItem;

export type InputPickerOptions = {
  visibleCount?: number;
  commonValues?: string[];
  searchPlaceholder?: string;
  groupLabel?: string;
  optionLabel?: string;
  changeGroupLabel?: string;
};

export type InputOptions =
  | { source: "none" }
  | ({ source: "static"; items: InputOption[] } & InputPickerOptions)
  | ({ source: "grouped"; groups: InputOptionGroup[] } & InputPickerOptions)
  | { source: "remote"; fkKey: string; endpoint: string; returnField?: "id" | "name"; lifecycleScope?: LifecycleScope; visibleCount?: number };

export type InputFormat = "text" | "number" | "percent" | "currency" | "date" | "time" | "datetime";

export type InputState = "normal" | "readonly" | "disabled" | "required" | "hidden";

export type InputMask =
  | string
  | {
      display?: string;
      edit?: string;
      placeholder?: string;
    };

export type InputValidation = {
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
};

export type InputFieldSpec = {
  valueType: InputValueType;
  editor: InputEditor;
  options?: InputOptions;
  format?: InputFormat;
  mask?: InputMask;
  state?: InputState | InputState[];
  validation?: InputValidation;
};

export type InputControlProps = {
  spec: InputFieldSpec;
  value: unknown;
  onChange?: (value: unknown, option?: unknown) => void;
  placeholder?: string;
  className?: string;
  size?: FieldControlSize;
  density?: "normal" | "compact";
};

function normalizeValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function stateSet(state?: InputState | InputState[]) {
  return new Set(Array.isArray(state) ? state : state ? [state] : ["normal"]);
}

function optionItems(options?: InputOptions) {
  if (!options) return [];
  if (options.source === "static") return options.items;
  if (options.source === "grouped") return options.groups.flatMap((group) => group.options);
  return [];
}

function toSearchableOption(option: InputOption): SearchableOption {
  return {
    value: option.value,
    label: option.label,
    subtitle: option.subtitle,
    searchText: option.searchText ?? option.description,
  };
}

function formatValue(value: unknown, spec: InputFieldSpec): ReactNode {
  const raw = normalizeValue(value);
  if (!raw) return "";
  if (typeof spec.mask === "object" && spec.mask.display) return spec.mask.display.replaceAll("{value}", raw);
  if (typeof spec.mask === "string") return spec.mask.replaceAll("{value}", raw);
  if (spec.format === "percent") return `${raw}%`;
  return raw;
}

export default function InputControl({
  spec,
  value,
  onChange,
  placeholder,
  className,
  size = "md",
  density = "normal",
}: InputControlProps) {
  const states = stateSet(spec.state);
  if (states.has("hidden")) return null;

  const disabled = states.has("disabled");
  const required = states.has("required") || spec.validation?.required;
  const fieldPlaceholder = placeholder ?? (typeof spec.mask === "object" ? spec.mask.placeholder : undefined);
  const stringValue = normalizeValue(value);

  if (states.has("readonly")) {
    return (
      <ReadOnlyField
        value={formatValue(value, spec)}
        placeholder={fieldPlaceholder}
        className={className}
        size={size}
        density={density}
      />
    );
  }

  if (spec.format === "percent") {
    return (
      <PercentField
        value={value === null || value === undefined || value === "" ? null : Number(value)}
        disabled={disabled}
        placeholder={fieldPlaceholder}
        min={spec.validation?.min}
        max={spec.validation?.max}
        onChange={(next) => onChange?.(next)}
      />
    );
  }

  switch (spec.editor) {
    case "textarea":
      return <TextareaField value={stringValue} disabled={disabled} placeholder={fieldPlaceholder} onChange={(next) => onChange?.(next)} />;
    case "datePicker":
      return <CalendarDateInput value={stringValue} disabled={disabled} placeholder={fieldPlaceholder} onChange={(next) => onChange?.(next)} />;
    case "timePicker":
      return <TimeField value={stringValue} disabled={disabled} onChange={(next) => onChange?.(next)} />;
    case "switch":
      return <SwitchField checked={Boolean(value)} disabled={disabled} onChange={(next) => onChange?.(next)} />;
    case "checkbox":
      return <CheckboxField checked={Boolean(value)} disabled={disabled} onChange={(next) => onChange?.(next)} />;
    case "upload":
      return <FileField disabled={disabled} onChange={(file) => onChange?.(file)} className={className} />;
    case "tags":
      return <TagStringInput value={stringValue} disabled={disabled} placeholder={fieldPlaceholder} onChange={(next) => onChange?.(next)} size={size} density={density} className={className} />;
    case "autocomplete":
      if (spec.options?.source === "remote") {
        return (
          <FkFieldInput
            fkKey={spec.options.fkKey}
            endpoint={spec.options.endpoint}
            value={stringValue}
            displayValue={stringValue}
            disabled={disabled}
            placeholder={fieldPlaceholder}
            lifecycleScope={spec.options.lifecycleScope}
            visibleCount={spec.options.visibleCount ?? 5}
            onChange={(label: string, option?: FkFieldOption) => {
              const next = spec.options?.source === "remote" && spec.options.returnField === "id" && option ? String(option.id) : label;
              onChange?.(next, option);
            }}
            className={className}
            size={size}
            density={density}
          />
        );
      }
      return (
        <SearchableOptionInput
          value={stringValue}
          options={optionItems(spec.options).map(toSearchableOption)}
          disabled={disabled}
          placeholder={fieldPlaceholder}
          maxResults={spec.options?.source === "static" || spec.options?.source === "grouped" ? spec.options.visibleCount ?? 5 : 5}
          onChange={(next, option) => onChange?.(next, option)}
          className={className}
        />
      );
    case "select":
    case "multiSelect":
      if (spec.options?.source === "grouped") {
        return (
          <OptionPicker
            value={stringValue}
            groups={spec.options.groups}
            disabled={disabled}
            placeholder={fieldPlaceholder}
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
          options={optionItems(spec.options)}
          disabled={disabled}
          placeholder={fieldPlaceholder}
          commonValues={spec.options?.source === "static" ? spec.options.commonValues : undefined}
          searchPlaceholder={spec.options?.source === "static" ? spec.options.searchPlaceholder : undefined}
          visibleCount={spec.options?.source === "static" ? spec.options.visibleCount ?? 8 : 8}
          onChange={(next) => onChange?.(next)}
          className={className}
        />
      );
    case "number":
    case "maskedInput":
    case "input":
    default:
      return (
        <TextField
          type={spec.editor === "number" || spec.valueType === "number" ? "number" : "text"}
          value={stringValue}
          disabled={disabled}
          required={required}
          min={spec.validation?.min}
          max={spec.validation?.max}
          placeholder={fieldPlaceholder}
          onChange={(next) => onChange?.(next)}
          className={className}
          size={size}
          density={density}
        />
      );
  }
}
