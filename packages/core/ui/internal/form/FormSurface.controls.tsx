"use client";

import { useState } from "react";
import InputSurface, { type InputSurfaceProps } from "../../InputSurface";
import ReadOnlyField, { type ReadOnlyFieldProps } from "../input/ReadOnlyField";
import TagListInput from "../input/TagListInput";
import TagPill from "../input/TagPill";
import { renderCommands } from "./form-surface-commands";
export { renderCommands };
import type {
  FormSurfaceFieldSpec,
  FormSurfaceItemSpec,
  FormSurfaceReadOnlyFieldSpec,
  FormSurfaceTagListAppendSpec,
  FormSurfaceTagListFieldSpec,
} from "../../FormSurface.types";

export function isInputField<T>(field: FormSurfaceItemSpec<T>): field is FormSurfaceFieldSpec {
  return !("kind" in field) || field.kind === "field";
}

export function renderControl(field: FormSurfaceFieldSpec, density: InputSurfaceProps["density"]) {
  return (
    <InputSurface
      spec={field.spec}
      value={field.value}
      displayValue={field.displayValue}
      onChange={field.onChange}
      placeholder={field.placeholder}
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
      autocompletePresentation={field.autocompletePresentation}
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
    ...props
  } = field;
  return <ReadOnlyField {...props} density={field.density ?? density} />;
}

function renderTagAppend(append?: FormSurfaceTagListAppendSpec) {
  if (!append?.field && !append?.action && !append?.textInput) return undefined;
  const textInput = append.textInput
    ? (() => {
        const { key, ...props } = append.textInput;
        return <TagAppendTextInput key={key} {...props} />;
      })()
    : null;
  const appendClassName = append.field
    ? "flex min-w-48 flex-1 basis-48 items-center gap-2"
    : "flex min-w-0 items-center gap-2";
  return (
    <div className={appendClassName}>
      {append.field ? renderControl(append.field, "compact") : null}
      {append.action ? renderCommands([append.action]) : null}
      {textInput}
    </div>
  );
}

function TagAppendTextInput({
  addLabel = "+",
  onAppend,
  onRemoveLast,
  placeholder,
  splitPattern = /[,，、;；\n]+/,
}: Omit<NonNullable<FormSurfaceTagListAppendSpec["textInput"]>, "key">) {
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
    return (
      <button
        type="button"
        aria-label={placeholder || "新增标签"}
        title={placeholder || "新增标签"}
        onClick={() => setEditing(true)}
        className="inline-flex rounded-full outline-none transition hover:-translate-y-px focus:ring-2 focus:ring-sky-300"
      >
        <TagPill
          maxLength={0}
          className="border-slate-300 bg-white px-3 text-slate-700 hover:border-sky-300 hover:bg-sky-50"
        >
          {addLabel}
        </TagPill>
      </button>
    );
  }

  return (
    <TagPill maxLength={0} className="border-sky-300 bg-sky-50 px-3 text-slate-800">
      <input
        autoFocus
        value={draft}
        aria-label={placeholder || "新增标签"}
        placeholder={placeholder}
        className="block min-w-20 max-w-full bg-transparent font-inherit text-inherit outline-none placeholder:text-slate-400"
        style={{ width: `${Math.max(5, Math.min(32, draft.length || placeholder?.length || 5))}em` }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={(event) => {
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
        }}
      />
    </TagPill>
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
    append,
    ...props
  } = field;
  return <TagListInput<T> {...props} append={renderTagAppend(append)} />;
}

export function renderFieldValue<T>(
  field: FormSurfaceFieldSpec | FormSurfaceReadOnlyFieldSpec | FormSurfaceTagListFieldSpec<T>,
  density: InputSurfaceProps["density"],
) {
  if (isInputField(field)) return renderControl(field, density);
  if (field.kind === "readonly") return renderReadOnly(field, density);
  return renderTagList(field);
}
