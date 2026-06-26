"use client";

import CalendarDateInput from "./CalendarDateInput";
import ChoiceGroup from "./ChoiceGroup";
import FileField from "./FileField";
import HiddenDataField from "./HiddenDataField";
import InputControl, { type InputControlProps } from "./InputControl";
import ReadOnlyField, { type ReadOnlyFieldProps } from "./ReadOnlyField";
import SelectField from "./SelectField";
import TagListInput from "./TagListInput";
import TextareaField from "./TextareaField";
import TextField from "./TextField";
import CommandButton from "./CommandButton";
import { Toolbar } from "./Toolbar";
import { joinClassNames } from "./card-utils";
import type {
  FormSurfaceCommandSpec,
  FormSurfaceControlSpec,
  FormSurfaceFieldSpec,
  FormSurfaceItemSpec,
  FormSurfaceReadOnlyFieldSpec,
  FormSurfaceTagListAppendSpec,
  FormSurfaceTagListFieldSpec,
  FormSurfaceToolbarSpec,
} from "./FormSurface.types";

export function isInputField<T>(field: FormSurfaceItemSpec<T>): field is FormSurfaceFieldSpec {
  return !("kind" in field) || field.kind === "field";
}

export function renderCommands(commands?: FormSurfaceCommandSpec[]) {
  if (!commands?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {commands.map((command) => (
        <CommandButton
          key={command.key}
          type={command.type}
          variant={command.variant}
          disabled={command.disabled}
          size={command.size}
          className={command.className}
          truncate={command.truncate}
          onClick={command.onClick}
        >
          {command.label}
        </CommandButton>
      ))}
    </div>
  );
}

export function renderToolbar(toolbar?: FormSurfaceToolbarSpec) {
  if (!toolbar?.items.length) return null;
  return <Toolbar {...toolbar} />;
}

export function renderControlSpec(control: FormSurfaceControlSpec) {
  if (control.kind === "inputControl") {
    const { kind: _kind, ...props } = control;
    return <InputControl {...props} />;
  }
  if (control.kind === "text") {
    const { kind: _kind, ...props } = control;
    return <TextField {...props} />;
  }
  if (control.kind === "textarea") {
    const { kind: _kind, ...props } = control;
    return <TextareaField {...props} />;
  }
  if (control.kind === "calendarDate") {
    const { kind: _kind, ...props } = control;
    return <CalendarDateInput {...props} />;
  }
  if (control.kind === "choice") {
    const { kind: _kind, ...props } = control;
    return <ChoiceGroup {...props} />;
  }
  if (control.kind === "select") {
    const { kind: _kind, ...props } = control;
    if (props.multiple === true) return <SelectField {...props} />;
    return <SelectField {...props} />;
  }
  if (control.kind === "file") {
    const { kind: _kind, ...props } = control;
    return <FileField {...props} />;
  }
  const { kind: _kind, ...props } = control;
  return <HiddenDataField {...props} />;
}

export function renderControl(field: FormSurfaceFieldSpec, density: InputControlProps["density"]) {
  return (
    <InputControl
      spec={field.spec}
      value={field.value}
      displayValue={field.displayValue}
      onChange={field.onChange}
      placeholder={field.placeholder}
      className={field.className}
      size={field.size}
      density={field.density ?? density}
      rows={field.rows}
      inputMode={field.inputMode}
      type={field.type}
      minLength={field.minLength}
      maxLength={field.maxLength}
      step={field.step}
      onKeyDown={field.onKeyDown}
      onBlur={field.onBlur}
      onFocus={field.onFocus}
      autoFocus={field.autoFocus}
      inputRef={field.inputRef}
      accept={field.accept}
      multiple={field.multiple}
      resetOnChange={field.resetOnChange}
      showFileName={field.showFileName}
      buttonLabel={field.buttonLabel}
      onFilesChange={field.onFilesChange}
      onQueryChange={field.onQueryChange}
      loading={field.loading}
      emptyText={field.emptyText}
      ratingLabel={field.ratingLabel}
      ratingMax={field.ratingMax}
      showRatingLabel={field.showRatingLabel}
    />
  );
}

function renderReadOnly(field: FormSurfaceReadOnlyFieldSpec, density: ReadOnlyFieldProps["density"]) {
  const {
    kind: _kind,
    key: _key,
    label: _label,
    required: _required,
    hint: _hint,
    error: _error,
    span: _span,
    fieldClassName: _fieldClassName,
    ...props
  } = field;
  return <ReadOnlyField {...props} density={field.density ?? density} />;
}

function renderTagAppend(append?: FormSurfaceTagListAppendSpec) {
  if (!append?.field && !append?.action) return undefined;
  return (
    <div className={joinClassNames("flex min-w-0 flex-1 items-center gap-2", append.className)}>
      {append.field ? renderControl(append.field, "compact") : null}
      {append.action ? renderCommands([append.action]) : null}
    </div>
  );
}

function renderTagList<T>(field: FormSurfaceTagListFieldSpec<T>) {
  const {
    kind: _kind,
    key: _key,
    label: _label,
    required: _required,
    hint: _hint,
    error: _error,
    span: _span,
    fieldClassName: _fieldClassName,
    append,
    ...props
  } = field;
  return <TagListInput<T> {...props} append={renderTagAppend(append)} />;
}

export function renderFieldValue<T>(
  field: FormSurfaceFieldSpec | FormSurfaceReadOnlyFieldSpec | FormSurfaceTagListFieldSpec<T>,
  density: InputControlProps["density"],
) {
  if (isInputField(field)) return renderControl(field, density);
  if (field.kind === "readonly") return renderReadOnly(field, density);
  return renderTagList(field);
}
