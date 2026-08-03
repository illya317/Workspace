"use client";

import FileField from "./FileField";
import FkFieldInput, { type FkFieldOption } from "./FkFieldInput";
import ReadOnlyField from "./ReadOnlyField";
import SegmentedCodeInput from "./SegmentedCodeInput";
import TagStringInput from "./TagStringInput";
import {
  formatInputSurfaceValue,
  inputMaskEditableSegment,
  normalizeInputSurfaceValue,
  resolveInputSurfaceInteractionState,
  type InputFieldSpec,
} from "./InputSurfaceTypes";
import {
  AntdAutocompleteChoice,
  AntdCheckboxField,
  AntdChoiceGroupField,
  AntdRatingField,
  AntdTagsField,
} from "./antd-input-choice";
import { AntdInputMarker, type AntdInputFieldProps } from "./antd-input-shared";
import { AntdDateField, AntdPercentField, AntdTimeField } from "./antd-input-temporal";
import { AntdTextareaField, AntdTextField } from "./antd-input-text";

export type AntdInputKind =
  | "text"
  | "number"
  | "textarea"
  | "segmentedText"
  | "percent"
  | "date"
  | "time"
  | "checkbox"
  | "choiceGroup"
  | "file"
  | "rating"
  | "tags"
  | "remoteReference"
  | "autocompleteChoice";

function resolveInputRenderer(spec: InputFieldSpec): AntdInputKind {
  if (spec.format === "percent") return "percent";
  if (inputMaskEditableSegment(spec.mask)) return "segmentedText";
  switch (spec.control) {
    case "text": return spec.multiline ? "textarea" : "text";
    case "number": return "number";
    case "temporal": return spec.precision === "time" || spec.valueType === "time" ? "time" : "date";
    case "boolean": return spec.presentation === "choice" ? "choiceGroup" : "checkbox";
    case "file": return "file";
    case "collection": return "tags";
    case "rating": return "rating";
    case "reference": return "remoteReference";
    case "choice": return spec.options?.source === "remote"
      ? "remoteReference"
      : spec.presentation === "choice" ? "choiceGroup" : "autocompleteChoice";
  }
  return assertNever(spec.control);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled Ant input renderer: ${String(value)}`);
}

/** Kept public for contract tests; its typed domain cannot accept an unknown renderer. */
export function resolveAntdInputKind(renderer: AntdInputKind): AntdInputKind {
  return renderer;
}

function AntdSegmentedTextField(props: AntdInputFieldProps) {
  const segment = inputMaskEditableSegment(props.spec.mask);
  if (!segment) return <AntdTextField {...props} />;
  const interaction = resolveInputSurfaceInteractionState(props.spec.state, props);
  const fullValue = normalizeInputSurfaceValue(props.value);
  return (
    <AntdInputMarker className={props.className} dataFieldKey={props.dataFieldKey} density={props.density} style={props.style} title={props.title}>
      <SegmentedCodeInput
        value={fullValue}
        editableSegment={{
          kind: "editableSegment",
          extract: segment.extract,
          compose: segment.compose,
          normalize: segment.normalize,
          placeholder: props.placeholder ?? segment.placeholder,
        }}
        disabled={interaction.disabled || interaction.readOnly}
        onChange={(next) => props.onChange?.(next)}
        size={props.size}
        density={props.density}
        onBlur={props.onBlur}
        onFocus={props.onFocus}
      />
    </AntdInputMarker>
  );
}

function AntdFileField(props: AntdInputFieldProps) {
  const interaction = resolveInputSurfaceInteractionState(props.spec.state, props);
  return (
    <AntdInputMarker className={props.className} dataFieldKey={props.dataFieldKey} density={props.density} style={props.style} title={props.title}>
      <FileField
        accept={props.accept}
        multiple={props.multiple ?? props.spec.multiple}
        disabled={interaction.disabled || interaction.readOnly}
        variant={props.fileVariant}
        resetOnChange={props.resetOnChange}
        showFileName={props.showFileName}
        buttonLabel={props.buttonLabel}
        onChange={(file) => props.onChange?.(file)}
        onFilesChange={props.onFilesChange}
      />
    </AntdInputMarker>
  );
}

function AntdConfirmedTagsField(props: AntdInputFieldProps) {
  const interaction = resolveInputSurfaceInteractionState(props.spec.state, props);
  return (
    <AntdInputMarker className={props.className} dataFieldKey={props.dataFieldKey} density={props.density} style={props.style} title={props.title}>
      <TagStringInput
        value={normalizeInputSurfaceValue(props.value)}
        disabled={interaction.disabled || interaction.readOnly}
        placeholder={props.placeholder}
        confirmDelete={props.confirmDelete}
        confirmRemove={props.confirmRemove}
        removeConfirmMessage={props.removeConfirmMessage}
        removeConfirmTitle={props.removeConfirmTitle}
        size={props.size}
        density={props.density}
        onChange={(next) => props.onChange?.(next)}
      />
    </AntdInputMarker>
  );
}

function AntdRemoteReferenceField(props: AntdInputFieldProps) {
  const interaction = resolveInputSurfaceInteractionState(props.spec.state, props);
  if (props.spec.options?.source !== "remote") return <AntdTextField {...props} />;
  const options = props.spec.options;
  return (
    <AntdInputMarker className={props.className} dataFieldKey={props.dataFieldKey} density={props.density} style={props.style} title={props.title}>
      <FkFieldInput
        fkKey={options.fkKey}
        endpoint={options.endpoint}
        value={normalizeInputSurfaceValue(props.value)}
        displayValue={props.displayValue ?? normalizeInputSurfaceValue(props.value)}
        disabled={interaction.disabled || interaction.readOnly}
        placeholder={props.placeholder}
        lifecycleScope={options.lifecycleScope}
        queryParams={options.queryParams}
        visibleCount={options.visibleCount ?? 5}
        dropdownPresentation={props.autocompletePresentation}
        autoFocus={props.autoFocus}
        onCancel={props.onDismiss}
        onChange={(label: string, option?: FkFieldOption) => {
          const next = option
            ? options.returnField === "id"
              ? String(option.id)
              : options.returnField === "subtitle"
                ? option.subtitle
                : label
            : label;
          props.onChange?.(next, option);
        }}
        size={props.size}
        density={props.density}
      />
    </AntdInputMarker>
  );
}

export function AntdInputSurface(props: AntdInputFieldProps) {
  const interaction = resolveInputSurfaceInteractionState(props.spec.state, props);
  if (interaction.hidden) {
    return <input type="hidden" data-field-key={props.dataFieldKey} value={normalizeInputSurfaceValue(props.value)} readOnly />;
  }
  if (interaction.readonlyDisplay) {
    return (
      <AntdInputMarker dataFieldKey={props.dataFieldKey} style={props.style} title={props.title}>
        <ReadOnlyField
          aria-label={props.ariaLabel}
          className={props.className}
          density={props.density}
          disabled={interaction.disabled}
          placeholder={props.placeholder}
          size={props.size}
          textAlign={props.textAlign}
          title={props.title}
          value={formatInputSurfaceValue(props.value, props.spec)}
        />
      </AntdInputMarker>
    );
  }
  const renderer = resolveAntdInputKind(resolveInputRenderer(props.spec));
  switch (renderer) {
    case "text":
    case "number": return <AntdTextField {...props} />;
    case "textarea": return <AntdTextareaField {...props} />;
    case "segmentedText": return <AntdSegmentedTextField {...props} />;
    case "percent": return <AntdPercentField {...props} />;
    case "date": return <AntdDateField {...props} />;
    case "time": return <AntdTimeField {...props} />;
    case "checkbox": return <AntdCheckboxField {...props} />;
    case "choiceGroup": return <AntdChoiceGroupField {...props} />;
    case "file": return <AntdFileField {...props} />;
    case "rating": return <AntdRatingField {...props} />;
    case "tags": return props.confirmRemove || props.confirmDelete ? <AntdConfirmedTagsField {...props} /> : <AntdTagsField {...props} />;
    case "remoteReference": return <AntdRemoteReferenceField {...props} />;
    case "autocompleteChoice": return <AntdAutocompleteChoice {...props} />;
  }
  return assertNever(renderer);
}
