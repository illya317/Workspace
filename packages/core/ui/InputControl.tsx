"use client";

import CalendarDateInput from "./CalendarDateInput";
import CheckboxField from "./CheckboxField";
import FileField from "./FileField";
import FkFieldInput, { type FkFieldOption } from "./FkFieldInput";
import OptionPicker from "./OptionPicker";
import PercentField from "./PercentField";
import RatingControl from "./RatingControl";
import ReadOnlyField from "./ReadOnlyField";
import SearchableOptionInput from "./SearchableOptionInput";
import SegmentedCodeInput from "./SegmentedCodeInput";
import SelectField from "./SelectField";
import SwitchField from "./SwitchField";
import TagStringInput from "./TagStringInput";
import TextareaField from "./TextareaField";
import TextField from "./TextField";
import TimeField from "./TimeField";
import {
  formatInputControlValue,
  inputControlOptionCount,
  inputControlOptionItems,
  inputControlStateSet,
  normalizeInputControlValue,
  toInputControlSearchableOption,
  type InputControlProps,
} from "./InputControlTypes";

export type {
  InputControlProps,
  InputEditor,
  InputFieldSpec,
  InputFormat,
  InputMask,
  InputOption,
  InputOptionGroup,
  InputOptions,
  InputOptionsMode,
  InputPickerOptions,
  InputSegmentedCodeConfig,
  InputState,
  InputValidation,
  InputValueType,
} from "./InputControlTypes";

export default function InputControl({
  spec,
  value,
  displayValue,
  onChange,
  placeholder,
  className,
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
  accept,
  multiple,
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
  if (states.has("hidden")) return null;

  const disabled = states.has("disabled");
  const required = states.has("required") || spec.validation?.required;
  const fieldPlaceholder = placeholder ?? (typeof spec.mask === "object" ? spec.mask.placeholder : undefined);
  const stringValue = normalizeInputControlValue(value);
  const textType = type ?? (spec.editor === "number" || spec.valueType === "number" ? "number" : "text");
  const renderTextField = () => <TextField ref={inputRef} type={textType} value={stringValue} disabled={disabled} required={required} autoFocus={autoFocus} min={spec.validation?.min} max={spec.validation?.max} step={step} minLength={minLength} maxLength={maxLength} inputMode={inputMode} placeholder={fieldPlaceholder} onChange={(next) => onChange?.(next)} className={className} size={size} density={density} onKeyDown={onKeyDown} onBlur={onBlur} onFocus={onFocus} />;

  if (states.has("readonly")) {
    return (
      <ReadOnlyField
        value={formatInputControlValue(value, spec)}
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
      return <TextareaField value={stringValue} disabled={disabled} placeholder={fieldPlaceholder} rows={rows} onChange={(next) => onChange?.(next)} />;
    case "datePicker":
      return <CalendarDateInput value={stringValue} disabled={disabled} placeholder={fieldPlaceholder} onChange={(next) => onChange?.(next)} />;
    case "timePicker":
      return <TimeField value={stringValue} disabled={disabled} onChange={(next) => onChange?.(next)} />;
    case "switch":
      return <SwitchField checked={Boolean(value)} disabled={disabled} onChange={(next) => onChange?.(next)} />;
    case "checkbox":
      return <CheckboxField checked={Boolean(value)} disabled={disabled} onChange={(next) => onChange?.(next)} />;
    case "upload":
      return (
        <FileField
          disabled={disabled}
          accept={accept}
          multiple={multiple}
          resetOnChange={resetOnChange}
          showFileName={showFileName}
          buttonLabel={buttonLabel}
          onChange={(file) => onChange?.(file)}
          onFilesChange={onFilesChange}
          className={className}
        />
      );
    case "rating":
      return (
        <RatingControl
          value={value === null || value === undefined || value === "" ? 0 : Number(value)}
          label={ratingLabel ?? fieldPlaceholder ?? "评分"}
          max={ratingMax}
          readOnly={disabled || states.has("readonly")}
          showLabel={showRatingLabel}
          onChange={(next) => onChange?.(next)}
          className={className}
        />
      );
    case "tags":
      return <TagStringInput value={stringValue} disabled={disabled} placeholder={fieldPlaceholder} onChange={(next) => onChange?.(next)} size={size} density={density} className={className} confirmDelete={confirmDelete} confirmRemove={confirmRemove} removeConfirmMessage={removeConfirmMessage} removeConfirmTitle={removeConfirmTitle} />;
    case "segmentedCode":
      if (!spec.segmentedCode) return renderTextField();
      return (
        <SegmentedCodeInput
          value={stringValue}
          editableSegment={{
            ...spec.segmentedCode,
            placeholder: fieldPlaceholder ?? spec.segmentedCode.placeholder,
          }}
          disabled={disabled}
          onChange={(next) => onChange?.(next)}
          className={className}
          size={size}
          density={density}
          onBlur={onBlur}
          onFocus={onFocus}
        />
      );
    case "autocomplete":
      if (spec.options?.source === "remote") {
        return (
          <FkFieldInput
            fkKey={spec.options.fkKey}
            endpoint={spec.options.endpoint}
            value={stringValue}
            displayValue={displayValue ?? stringValue}
            disabled={disabled}
            placeholder={fieldPlaceholder}
            lifecycleScope={spec.options.lifecycleScope}
            queryParams={spec.options.queryParams}
            visibleCount={spec.options.visibleCount ?? 5}
            dropdownPresentation={autocompletePresentation}
            onChange={(label: string, option?: FkFieldOption) => {
              const next =
                spec.options?.source === "remote" && option
                  ? spec.options.returnField === "id"
                    ? String(option.id)
                    : spec.options.returnField === "subtitle"
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
      return (
        <SearchableOptionInput
          value={stringValue}
          options={inputControlOptionItems(spec.options).map(toInputControlSearchableOption)}
          disabled={disabled}
          placeholder={fieldPlaceholder}
          maxResults={spec.options?.source === "static" || spec.options?.source === "grouped" ? spec.options.visibleCount ?? 5 : 5}
          presentation={autocompletePresentation}
          onChange={(next, option) => onChange?.(next, option)}
          onQueryChange={onQueryChange}
          loading={loading}
          emptyText={emptyText}
          className={className}
        />
      );
    case "select":
    case "multiSelect":
      if (spec.options?.source === "static" || spec.options?.source === "grouped") {
        const mode = spec.options.mode ?? "auto";
        const shouldAutocomplete = mode === "autocomplete" || (mode === "auto" && inputControlOptionCount(spec.options) > 8);
        if (shouldAutocomplete) {
          return (
            <SearchableOptionInput
              value={stringValue}
              options={inputControlOptionItems(spec.options).map(toInputControlSearchableOption)}
              disabled={disabled}
              placeholder={fieldPlaceholder}
              maxResults={spec.options.visibleCount ?? 5}
              presentation={autocompletePresentation}
              onChange={(next, option) => onChange?.(next, option)}
              onQueryChange={onQueryChange}
              loading={loading}
              emptyText={emptyText}
              className={className}
            />
          );
        }
        if (mode === "dropdown") {
          return (
            <SelectField
              value={stringValue}
              options={inputControlOptionItems(spec.options)}
              disabled={disabled}
              placeholder={fieldPlaceholder}
              searchable={inputControlOptionCount(spec.options) > 8}
              onChange={(next) => onChange?.(next)}
              className={className}
              size={size}
              density={density}
            />
          );
        }
      }
      if (spec.options?.source === "grouped") {
        return (
          <OptionPicker
            value={stringValue}
            groups={spec.options.groups}
            disabled={disabled}
            placeholder={fieldPlaceholder}
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
          placeholder={fieldPlaceholder}
          unsetLabel={spec.options?.source === "static" ? spec.options.unsetLabel : undefined}
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
      return renderTextField();
  }
}
