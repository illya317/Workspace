import type { ReactNode, Ref } from "react";
import type { FileFieldProps } from "./FileField";
import type { FieldControlSize } from "./FormStyles";
import type { LifecycleScope } from "./FkFieldInput";
import type { PickerGroupItem, PickerOption } from "./OptionPickerTypes";
import type { SearchableOption } from "./SearchableOptionInput";
import type { TextFieldProps } from "./TextField";

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
  | "maskedInput"
  | "rating";

export type InputOption = PickerOption & { searchText?: string; subtitle?: string };
export type InputOptionGroup = PickerGroupItem;
export type InputOptionsMode = "auto" | "picker" | "dropdown" | "autocomplete";

export type InputPickerOptions = {
  mode?: InputOptionsMode;
  visibleCount?: number;
  commonValues?: string[];
  searchPlaceholder?: string;
  unsetLabel?: string;
  groupLabel?: string;
  optionLabel?: string;
  changeGroupLabel?: string;
};

export type InputOptions =
  | { source: "none" }
  | ({ source: "static"; items: InputOption[] } & InputPickerOptions)
  | ({ source: "grouped"; groups: InputOptionGroup[] } & InputPickerOptions)
  | {
      source: "remote";
      fkKey: string;
      endpoint: string;
      returnField?: "id" | "name" | "subtitle";
      lifecycleScope?: LifecycleScope;
      queryParams?: Record<string, string | number | boolean | null | undefined>;
      visibleCount?: number;
    };

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
  value?: unknown;
  displayValue?: string;
  onChange?: (value: unknown, option?: unknown) => void;
  placeholder?: string;
  className?: string;
  size?: FieldControlSize;
  density?: "normal" | "compact";
  rows?: number;
  inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search";
  type?: TextFieldProps["type"];
  minLength?: number;
  maxLength?: number;
  step?: number | string;
  onKeyDown?: TextFieldProps["onKeyDown"];
  onBlur?: TextFieldProps["onBlur"];
  onFocus?: TextFieldProps["onFocus"];
  autoFocus?: TextFieldProps["autoFocus"];
  inputRef?: Ref<HTMLInputElement>;
  accept?: FileFieldProps["accept"];
  multiple?: FileFieldProps["multiple"];
  resetOnChange?: FileFieldProps["resetOnChange"];
  showFileName?: FileFieldProps["showFileName"];
  buttonLabel?: FileFieldProps["buttonLabel"];
  onFilesChange?: FileFieldProps["onFilesChange"];
  onQueryChange?: (query: string) => void;
  loading?: boolean;
  emptyText?: string;
  ratingLabel?: string;
  ratingMax?: number;
  showRatingLabel?: boolean;
};

export function normalizeInputControlValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function inputControlStateSet(state?: InputState | InputState[]) {
  return new Set(Array.isArray(state) ? state : state ? [state] : ["normal"]);
}

export function inputControlOptionItems(options?: InputOptions) {
  if (!options) return [];
  if (options.source === "static") return options.items;
  if (options.source === "grouped") return options.groups.flatMap((group) => group.options);
  return [];
}

export function inputControlOptionCount(options?: InputOptions) {
  return inputControlOptionItems(options).length;
}

export function toInputControlSearchableOption(option: InputOption): SearchableOption {
  return {
    value: option.value,
    label: option.label,
    subtitle: option.subtitle,
    searchText: option.searchText ?? option.description,
  };
}

export function formatInputControlValue(value: unknown, spec: InputFieldSpec): ReactNode {
  const raw = normalizeInputControlValue(value);
  if (!raw) return "";
  if (typeof spec.mask === "object" && spec.mask.display) return spec.mask.display.replaceAll("{value}", raw);
  if (typeof spec.mask === "string") return spec.mask.replaceAll("{value}", raw);
  if (spec.format === "percent") return `${raw}%`;
  return raw;
}
