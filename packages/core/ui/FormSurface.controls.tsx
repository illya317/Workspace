"use client";

import { useState } from "react";
import InputControl, { type InputControlProps } from "./InputControl";
import ReadOnlyField, { type ReadOnlyFieldProps } from "./ReadOnlyField";
import TagListInput from "./TagListInput";
import { joinClassNames } from "./card-utils";
import { renderCommands } from "./form-surface-commands";
export { renderCommands };
import type {
  FormSurfaceFieldSpec,
  FormSurfaceItemSpec,
  FormSurfaceReadOnlyFieldSpec,
  FormSurfaceTagListAppendSpec,
  FormSurfaceTagListFieldSpec,
} from "./FormSurface.types";

export function isInputField<T>(field: FormSurfaceItemSpec<T>): field is FormSurfaceFieldSpec {
  return !("kind" in field) || field.kind === "field";
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
  if (!append?.field && !append?.action && !append?.textInput) return undefined;
  const textInput = append.textInput
    ? (() => {
        const { key, ...props } = append.textInput;
        return <TagAppendTextInput key={key} fieldKey={key} {...props} />;
      })()
    : null;
  return (
    <div className={joinClassNames("flex min-w-0 flex-1 items-center gap-2", append.className)}>
      {append.field ? renderControl(append.field, "compact") : null}
      {append.action ? renderCommands([append.action]) : null}
      {textInput}
    </div>
  );
}

function TagAppendTextInput({
  addLabel = "+",
  className,
  fieldKey,
  inputClassName,
  onAppend,
  onRemoveLast,
  placeholder,
  splitPattern = /[,，、;；\n]+/,
}: Omit<NonNullable<FormSurfaceTagListAppendSpec["textInput"]>, "key"> & { fieldKey: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function commitDraft() {
    const values = draft
      .split(splitPattern)
      .map((value) => value.trim())
      .filter(Boolean);
    if (values.length > 0) onAppend(values);
    setDraft("");
    setEditing(false);
  }

  if (!editing) {
    return renderCommands([{
      key: `${fieldKey}-start`,
      label: addLabel,
      onClick: () => setEditing(true),
      size: "sm",
      className: joinClassNames("!size-7 !rounded-full !border-slate-200 !bg-slate-50 !p-0 text-base font-semibold leading-none !text-slate-700 hover:!border-slate-300 hover:!bg-slate-100", className),
    }]);
  }

  return renderControl({
    key: fieldKey,
    label: "",
    spec: { valueType: "string", control: "text" },
    value: draft,
    autoFocus: true,
    placeholder,
    density: "compact",
    className: inputClassName,
    onChange: (next) => setDraft(String(next ?? "")),
    onBlur: commitDraft,
    onKeyDown: (event) => {
      if (event.key === "Enter" || event.key === "Tab" || event.key === "," || event.key === "，" || event.key === "、") {
        if (draft.trim()) {
          event.preventDefault();
          commitDraft();
        }
      }
      if (event.key === "Escape") {
        setDraft("");
        setEditing(false);
      }
      if (event.key === "Backspace" && !draft) onRemoveLast?.();
    },
  }, "compact");
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
