"use client";

import CalendarDateInput from "./internal/input/CalendarDateInput";
import CheckboxField from "./internal/input/CheckboxField";
import ChoiceGroup from "./internal/input/ChoiceGroup";
import FileField from "./internal/input/FileField";
import PercentField from "./internal/input/PercentField";
import RatingControl from "./internal/input/RatingControl";
import ReadOnlyField from "./internal/input/ReadOnlyField";
import SegmentedCodeInput from "./internal/input/SegmentedCodeInput";
import SwitchField from "./internal/input/SwitchField";
import TagStringInput from "./internal/input/TagStringInput";
import TextareaField from "./internal/input/TextareaField";
import TextField from "./internal/input/TextField";
import TimeField from "./internal/input/TimeField";
import InputControlChoiceRenderer, { isInputControlChoiceRenderer, type InputControlChoiceRendererKind } from "./internal/input/input-control-choice-renderers";
import {
  formatInputControlValue,
  inputControlOptionCount,
  inputControlOptionItems,
  inputControlStateSet,
  inputMaskEditableSegment,
  inputMaskPlaceholder,
  normalizeInputControlValue,
  type InputControlProps,
  type InputFieldSpec,
} from "./internal/input/InputControlTypes";

export type {
  InputBooleanPresentation,
  InputCollectionItemControl,
  InputControlDimension,
  InputControlKind,
  InputControlProps,
  InputDependencies,
  InputDependencyDimension,
  InputFieldSpec,
  InputFormat,
  InputMask,
  InputOption,
  InputOptionDimension,
  InputOptionGroup,
  InputOptions,
  InputOptionsMode,
  InputPickerOptions,
  InputPresentationDimension,
  InputState,
  InputStateDimension,
  InputTemporalPrecision,
  InputUsage,
  InputUsageDimension,
  InputValidation,
  InputValidationDimension,
  InputValueDimension,
  InputValueType,
} from "./internal/input/InputControlTypes";

type ResolvedInputRenderer =
  | "text"
  | "textarea"
  | "segmentedText"
  | "number"
  | "percent"
  | "date"
  | "time"
  | "checkbox"
  | "switch"
  | "choiceGroup"
  | "file"
  | "rating"
  | "tags"
  | InputControlChoiceRendererKind;

function resolveInputRenderer(spec: InputFieldSpec): ResolvedInputRenderer {
  if (spec.format === "percent") return "percent";
  if (inputMaskEditableSegment(spec.mask)) return "segmentedText";

  if (spec.control === "number") return "number";
  if (spec.control === "temporal") return spec.precision === "time" || spec.valueType === "time" ? "time" : "date";
  if (spec.control === "boolean") {
    if (spec.presentation === "switch") return "switch";
    if (spec.presentation === "choice") return "choiceGroup";
    return "checkbox";
  }
  if (spec.control === "file") return "file";
  if (spec.control === "collection") return "tags";
  if (spec.control === "rating") return "rating";
  if (spec.control === "reference" || spec.options?.source === "remote") return "remoteReference";
  if (spec.control === "choice") {
    if (spec.presentation === "choice") return "choiceGroup";
    if (spec.options?.source === "static" || spec.options?.source === "grouped") {
      const mode = spec.options.mode ?? "auto";
      if (mode === "autocomplete" || (mode === "auto" && inputControlOptionCount(spec.options) > 8)) return "autocompleteChoice";
      if (mode === "dropdown") return "selectChoice";
    }
    return "pickerChoice";
  }
  if (spec.multiline) return "textarea";
  return "text";
}

export default function InputControl({
  spec,
  value,
  displayValue,
  onChange,
  placeholder,
  size = "md",
  density = "normal",
  rows,
  inputMode,
  type,
  minLength,
  maxLength,
  step,
  onKeyDown,
  onBlur,
  onFocus,
  autoFocus,
  inputRef,
  readOnly,
  ariaLabel,
  dataFieldKey,
  title,
  textAlign,
  visualState,
  resize,
  choiceType,
  choiceName,
  accept,
  multiple,
  fileVariant,
  resetOnChange,
  showFileName,
  buttonLabel,
  onFilesChange,
  autocompletePresentation,
  onQueryChange,
  loading,
  emptyText,
  confirmDelete,
  confirmRemove,
  removeConfirmMessage,
  removeConfirmTitle,
  ratingLabel,
  ratingMax,
  showRatingLabel,
}: InputControlProps) {
  const states = inputControlStateSet(spec.state);
  if (states.has("hidden")) {
    return <input type="hidden" data-field-key={dataFieldKey} value={normalizeInputControlValue(value)} readOnly />;
  }

  const disabled = states.has("disabled");
  const required = states.has("required") || spec.validation?.required;
  const fieldPlaceholder = placeholder ?? inputMaskPlaceholder(spec.mask);
  const stringValue = normalizeInputControlValue(value);
  const textType = type ?? (spec.control === "number" || spec.valueType === "number" ? "number" : "text");
  const textVisualState = visualState === "info" ? "default" : visualState;
  const fieldVisualState = visualState;
  const renderer = resolveInputRenderer(spec);

  const renderTextField = () => (
    <TextField
      ref={inputRef}
      type={textType}
      value={stringValue}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      autoFocus={autoFocus}
      min={spec.validation?.min}
      max={spec.validation?.max}
      step={step}
      minLength={minLength}
      maxLength={maxLength}
      inputMode={inputMode}
      ariaLabel={ariaLabel}
      dataFieldKey={dataFieldKey}
      title={title}
      textAlign={textAlign}
      state={textVisualState}
      placeholder={fieldPlaceholder}
      onChange={(next) => onChange?.(next)}
      size={size}
      density={density}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      onFocus={onFocus}
    />
  );

  if (states.has("readonly")) {
    return (
      <ReadOnlyField
        value={formatInputControlValue(value, spec)}
        placeholder={fieldPlaceholder}
        size={size}
        density={density}
      />
    );
  }

  if (renderer === "percent") {
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

  if (renderer === "textarea") {
    return (
      <TextareaField
        value={stringValue}
        disabled={disabled}
        readOnly={readOnly}
        ariaLabel={ariaLabel}
        dataFieldKey={dataFieldKey}
        title={title}
        state={fieldVisualState}
        resize={resize}
        placeholder={fieldPlaceholder}
        rows={rows}
        onChange={(next) => onChange?.(next)}
        onKeyDown={onKeyDown as never}
      />
    );
  }

  if (renderer === "segmentedText") {
    const editableSegment = inputMaskEditableSegment(spec.mask);
    if (!editableSegment) return renderTextField();
    return (
      <SegmentedCodeInput
        value={stringValue}
        editableSegment={{
          kind: "editableSegment",
          extract: editableSegment.extract,
          compose: editableSegment.compose,
          normalize: editableSegment.normalize,
          placeholder: fieldPlaceholder ?? editableSegment.placeholder,
        }}
        disabled={disabled}
        onChange={(next) => onChange?.(next)}
        size={size}
        density={density}
        onBlur={onBlur}
        onFocus={onFocus}
      />
    );
  }

  if (renderer === "date") {
    return (
      <CalendarDateInput
        value={stringValue}
        disabled={disabled}
        readOnly={readOnly}
        title={title}
        state={fieldVisualState}
        placeholder={fieldPlaceholder}
        onChange={(next) => onChange?.(next)}
      />
    );
  }

  if (renderer === "time") {
    return <TimeField value={stringValue} disabled={disabled} onChange={(next) => onChange?.(next)} />;
  }

  if (renderer === "switch") {
    return <SwitchField checked={Boolean(value)} disabled={disabled} onChange={(next) => onChange?.(next)} />;
  }

  if (renderer === "checkbox") {
    return <CheckboxField checked={Boolean(value)} disabled={disabled} onChange={(next) => onChange?.(next)} />;
  }

  if (renderer === "choiceGroup") {
    return (
      <ChoiceGroup
        options={inputControlOptionItems(spec.options).map((option) => String(option.value))}
        type={choiceType ?? (spec.multiple ? "checkbox" : "radio")}
        name={choiceName}
        value={stringValue}
        disabled={disabled}
        dataFieldKey={dataFieldKey}
        onChange={(next) => onChange?.(next)}
      />
    );
  }

  if (renderer === "file") {
    return (
      <FileField
        disabled={disabled}
        accept={accept}
        multiple={multiple ?? spec.multiple}
        variant={fileVariant}
        resetOnChange={resetOnChange}
        showFileName={showFileName}
        buttonLabel={buttonLabel}
        onChange={(file) => onChange?.(file)}
        onFilesChange={onFilesChange}
      />
    );
  }

  if (renderer === "rating") {
    return (
      <RatingControl
        value={value === null || value === undefined || value === "" ? 0 : Number(value)}
        label={ratingLabel ?? fieldPlaceholder ?? "评分"}
        max={ratingMax}
        readOnly={disabled || states.has("readonly")}
        showLabel={showRatingLabel}
        onChange={(next) => onChange?.(next)}
      />
    );
  }

  if (renderer === "tags") {
    return (
      <TagStringInput
        value={stringValue}
        disabled={disabled}
        placeholder={fieldPlaceholder}
        onChange={(next) => onChange?.(next)}
        size={size}
        density={density}
        confirmDelete={confirmDelete}
        confirmRemove={confirmRemove}
        removeConfirmMessage={removeConfirmMessage}
        removeConfirmTitle={removeConfirmTitle}
      />
    );
  }

  if (isInputControlChoiceRenderer(renderer)) {
    return (
      <InputControlChoiceRenderer
        renderer={renderer}
        spec={spec}
        value={value}
        displayValue={displayValue}
        stringValue={stringValue}
        disabled={disabled}
        placeholder={fieldPlaceholder}
        autocompletePresentation={autocompletePresentation}
        onChange={onChange}
        onQueryChange={onQueryChange}
        loading={loading}
        emptyText={emptyText}
        size={size}
        density={density}
        textAlign={textAlign}
        fallback={renderTextField}
      />
    );
  }

  return renderTextField();
}
