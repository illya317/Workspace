"use client";

import { useState } from "react";
import InputSurface, { type InputSurfaceProps } from "../../InputSurface";
import DetailModal from "../common/DetailModal";
import FieldGrid from "../input/FieldGrid";
import ReadOnlyField, { type ReadOnlyFieldProps } from "../input/ReadOnlyField";
import FkFieldInput from "../input/FkFieldInput";
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

const TAG_REFERENCE_MODAL_MAX_WIDTH = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-6xl",
} as const;

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
      fileVariant={field.fileVariant}
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
  if (!append?.field && !append?.action && !append?.referenceInput && !append?.textInput) return undefined;
  const referenceInput = append.referenceInput
    ? (() => {
        const { key, ...props } = append.referenceInput;
        return <TagAppendReferenceInput key={key} {...props} />;
      })()
    : null;
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
      {referenceInput}
      {textInput}
    </div>
  );
}

function TagAppendReferenceInput({
  addLabel = "+",
  create,
  endpoint,
  fkKey,
  lifecycleScope,
  modalSize = "md",
  modalTitle,
  onAppend,
  onRemoveLast,
  placeholder,
  presentation = "inline",
  queryParams,
  searchLabel,
  visibleCount,
}: Omit<NonNullable<FormSurfaceTagListAppendSpec["referenceInput"]>, "key">) {
  const [editing, setEditing] = useState(false);

  if (presentation === "modal") {
    return (
      <>
        <TagAppendTrigger addLabel={addLabel} placeholder={placeholder} onClick={() => setEditing(true)} />
        <DetailModal
          open={editing}
          title={modalTitle || placeholder || "新增关联记录"}
          onClose={() => setEditing(false)}
          maxWidth={TAG_REFERENCE_MODAL_MAX_WIDTH[modalSize]}
        >
          <div className="space-y-5">
            <section className="space-y-2">
              <div className="text-sm font-semibold text-slate-600">{searchLabel || "选择已有记录"}</div>
              <FkFieldInput
                fkKey={fkKey}
                endpoint={endpoint}
                value=""
                displayValue=""
                placeholder={placeholder}
                lifecycleScope={lifecycleScope}
                queryParams={queryParams}
                visibleCount={visibleCount}
                appearance="field"
                size="md"
                density="compact"
                widthMode="fill"
                dropdownPresentation="inline"
                autoFocus
                onChange={(_value, option) => {
                  if (!option) return;
                  onAppend(option);
                  setEditing(false);
                }}
              />
            </section>
            {create ? <TagAppendReferenceCreatePanel create={create} /> : null}
          </div>
        </DetailModal>
      </>
    );
  }

  if (!editing) {
    return <TagAppendTrigger addLabel={addLabel} placeholder={placeholder} onClick={() => setEditing(true)} />;
  }

  return (
    <span
      className="block w-full min-w-0 max-w-full basis-full"
      onKeyDownCapture={(event) => {
        const target = event.target as HTMLInputElement;
        if (event.key === "Escape") {
          event.preventDefault();
          setEditing(false);
        }
        if (event.key === "Backspace" && target.value === "") onRemoveLast?.();
      }}
    >
      <FkFieldInput
        fkKey={fkKey}
        endpoint={endpoint}
        value=""
        displayValue=""
        placeholder={placeholder}
        lifecycleScope={lifecycleScope}
        queryParams={queryParams}
        visibleCount={visibleCount}
        appearance="field"
        size="sm"
        density="compact"
        widthMode="fill"
        dropdownPresentation="popover"
        autoFocus
        onCancel={() => setEditing(false)}
        onChange={(_value, option) => {
          if (!option) return;
          onAppend(option);
          setEditing(false);
        }}
      />
    </span>
  );
}

function TagAppendTrigger({
  addLabel,
  onClick,
  placeholder,
}: {
  addLabel: string;
  onClick: () => void;
  placeholder?: string;
}) {
  return (
    <button
      type="button"
      aria-label={placeholder || "新增标签"}
      title={placeholder || "新增标签"}
      onClick={onClick}
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

function TagAppendReferenceCreatePanel({
  create,
}: {
  create: NonNullable<NonNullable<FormSurfaceTagListAppendSpec["referenceInput"]>["create"]>;
}) {
  const layout = create.layout ?? {};
  const density = layout.density ?? "compact";
  return (
    <section className="space-y-3 border-t border-slate-100 pt-4">
      {(create.title || create.description) && (
        <div className="space-y-1">
          {create.title ? <div className="text-sm font-semibold text-slate-700">{create.title}</div> : null}
          {create.description ? <div className="text-xs leading-5 text-slate-500">{create.description}</div> : null}
        </div>
      )}
      <FieldGrid columns={layout.columns ?? 2} mode={layout.mode ?? "mixed"}>
        {create.fields.map((field) => (
          <FieldGrid.Cell
            key={field.key}
            label={field.label}
            required={field.required}
            hint={field.hint ?? field.error}
            span={field.span}
            rowSpan={field.rowSpan}
            mode={layout.mode ?? "mixed"}
          >
            {renderControl(field, density)}
          </FieldGrid.Cell>
        ))}
      </FieldGrid>
      <div className="flex justify-end gap-2">
        {renderCommands([...(create.actions ?? []), create.submit])}
      </div>
    </section>
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
