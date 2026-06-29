import type { CSSProperties, ReactNode, Ref } from "react";
import type { ChoiceGroupProps } from "./ChoiceGroup";
import type { FileFieldProps } from "./FileField";
import type { FieldControlSize } from "../form/FormStyles";
import type { LifecycleScope } from "./FkFieldInput";
import type { PickerGroupItem, PickerOption } from "../selection/OptionPickerTypes";
import type { SearchableOption, SearchableOptionInputProps } from "./SearchableOptionInput";
import type { TagStringInputProps } from "./TagStringInput";
import type { FieldFontRole, FieldTextAlign, FieldVisualState, FieldVisualVariant } from "./TextField";
import type { TextareaFieldProps } from "./TextareaField";
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

export type InputControlKind =
  | "text"
  | "number"
  | "boolean"
  | "choice"
  | "reference"
  | "temporal"
  | "file"
  | "collection"
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
export type InputUsage = "form" | "filter" | "table" | "search";
export type InputBooleanPresentation = "checkbox" | "switch" | "choice";
export type InputTemporalPrecision = "date" | "time" | "datetime";
export type InputCollectionItemControl = "text";

export type InputMask =
  | string
  | {
      kind?: "template";
      display?: string;
      edit?: string;
      placeholder?: string;
    }
  | {
      kind: "editableSegment";
      extract: (fullCode: string) => string;
      compose: (segment: string, fullCode: string) => string;
      normalize?: (segment: string) => string;
      placeholder?: string;
    };

export type InputValidation = {
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
};

export type InputDependencies = {
  cascadeFrom?: string | string[];
  filters?: Record<string, unknown>;
  queryParams?: Record<string, string | number | boolean | null | undefined>;
};

export type InputValueDimension = {
  valueType: InputValueType;
};

export type InputControlDimension = {
  control: InputControlKind;
};

export type InputOptionDimension = {
  options?: InputOptions;
};

export type InputPresentationDimension = {
  format?: InputFormat;
  mask?: InputMask;
  multiline?: boolean;
  multiple?: boolean;
  presentation?: InputBooleanPresentation;
  precision?: InputTemporalPrecision;
  itemControl?: InputCollectionItemControl;
};

export type InputStateDimension = {
  state?: InputState | InputState[];
};

export type InputValidationDimension = {
  validation?: InputValidation;
};

export type InputUsageDimension = {
  usage?: InputUsage | InputUsage[];
};

export type InputDependencyDimension = {
  dependencies?: InputDependencies;
};

export type InputFieldSpec =
  & InputValueDimension
  & InputControlDimension
  & InputOptionDimension
  & InputPresentationDimension
  & InputStateDimension
  & InputValidationDimension
  & InputUsageDimension
  & InputDependencyDimension;

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
  readOnly?: boolean;
  ariaLabel?: string;
  dataFieldKey?: string;
  style?: CSSProperties;
  title?: string;
  unstyled?: boolean;
  wrapperClassName?: string;
  textAlign?: FieldTextAlign;
  fontRole?: FieldFontRole;
  visualVariant?: FieldVisualVariant;
  visualState?: FieldVisualState | "info";
  resize?: TextareaFieldProps["resize"];
  choiceType?: ChoiceGroupProps["type"];
  choiceName?: ChoiceGroupProps["name"];
  choiceOptionClassName?: ChoiceGroupProps["optionClassName"];
  choiceMarkerClassName?: ChoiceGroupProps["markerClassName"];
  accept?: FileFieldProps["accept"];
  multiple?: FileFieldProps["multiple"];
  fileVariant?: FileFieldProps["variant"];
  fileInputClassName?: FileFieldProps["inputClassName"];
  fileControlsClassName?: FileFieldProps["controlsClassName"];
  resetOnChange?: FileFieldProps["resetOnChange"];
  showFileName?: FileFieldProps["showFileName"];
  buttonLabel?: FileFieldProps["buttonLabel"];
  onFilesChange?: FileFieldProps["onFilesChange"];
  autocompletePresentation?: SearchableOptionInputProps["presentation"];
  onQueryChange?: (query: string) => void;
  loading?: boolean;
  emptyText?: string;
  confirmDelete?: TagStringInputProps["confirmDelete"];
  confirmRemove?: TagStringInputProps["confirmRemove"];
  removeConfirmMessage?: TagStringInputProps["removeConfirmMessage"];
  removeConfirmTitle?: TagStringInputProps["removeConfirmTitle"];
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

export function inputMaskPlaceholder(mask?: InputMask) {
  if (typeof mask === "object") return mask.placeholder;
  return undefined;
}

export function inputMaskEditableSegment(mask?: InputMask) {
  if (typeof mask === "object" && mask.kind === "editableSegment") return mask;
  return undefined;
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
  if (typeof spec.mask === "object" && spec.mask.kind !== "editableSegment" && spec.mask.display) return spec.mask.display.replaceAll("{value}", raw);
  if (typeof spec.mask === "string") return spec.mask.replaceAll("{value}", raw);
  if (spec.format === "percent") return `${raw}%`;
  return raw;
}
