"use client";

import { DocumentPreview, type EditorBlock, type EditorDocument, type EditorSlotInline, type FieldModel } from "@workspace/platform/document-editor";
import { QcPaperDateInput } from "./QcPaperDateInput";
import { QcPaperChoiceInput, QcPaperLineInput, QcPaperSelectInput } from "./QcPaperInputs";
import type { EditorRuntimeValues } from "./useEditorRuntimeFormulaEngine";

interface Props {
  blocks: EditorBlock[];
  fieldModel: FieldModel;
  values: EditorRuntimeValues;
  referenceValues?: EditorRuntimeValues;
  onFieldChange?: (key: string, value: string) => void;
  readOnly?: boolean;
}

type RenderContext = Props & { inTable?: boolean };

export default function QcEditorRuntimePaper({ blocks, fieldModel, values, referenceValues, onFieldChange, readOnly = false }: Props) {
  const context = { blocks, fieldModel, values, referenceValues, onFieldChange, readOnly };
  const document: EditorDocument = {
    schemaVersion: 1,
    kind: "qc-editor-document",
    id: "qc-runtime-document",
    title: "批次检验记录",
    blocks,
  };
  return (
    <DocumentPreview
      document={document}
      values={values}
      renderSlot={({ part, inTable }) => <RuntimeSlot part={part} context={{ ...context, inTable }} />}
    />
  );
}

function RuntimeSlot({ part, context }: { part: EditorSlotInline; context: RenderContext }) {
  const value = slotValue(part, context);
  const field = fieldDefinition(context.fieldModel, part.fieldKey);
  const inputType = part.inputType || field?.inputType || field?.type || (part.type === "dateSlot" ? "date" : "text");
  const disabled = context.readOnly || !context.onFieldChange || part.readonlyDisplay || part.slotKind === "formula" || part.slotKind === "reference" || !!part.referenceFieldKey;
  const layoutPart = {
    type: part.type === "dateSlot" ? "date" : inputType === "select" ? "select" : "line",
    fieldKey: part.fieldKey,
    width: part.width ? String(part.width) : "3rem",
    align: part.align || "center",
    inputType,
    defaultValue: part.defaultValue,
    defaultOffsetDays: part.defaultOffsetDays,
    placeholder: part.placeholder,
    readonlyDisplay: disabled,
    withTime: part.withTime,
    underline: true,
  };

  if (part.type === "dateSlot" || inputType === "date" || inputType === "datetime") {
    return <QcPaperDateInput part={layoutPart} value={value} hourValue={context.values[`${part.fieldKey}_hour`]} onChange={(next) => context.onFieldChange?.(part.fieldKey, next)} onHourChange={(next) => context.onFieldChange?.(`${part.fieldKey}_hour`, next)} readOnly={disabled} inTable={context.inTable} />;
  }
  if (inputType === "radio" || inputType === "checkbox") {
    return <QcPaperChoiceInput fieldKey={part.fieldKey} options={part.options ?? field?.options} type={inputType} disabled={disabled} value={value} onChange={(next) => context.onFieldChange?.(part.fieldKey, next)} />;
  }
  if (inputType === "select" || part.options?.length || field?.options?.length) {
    return <QcPaperSelectInput part={layoutPart} options={part.options ?? field?.options} readOnly={disabled} value={value} onChange={(next) => context.onFieldChange?.(part.fieldKey, next)} inTable={context.inTable} />;
  }
  return <QcPaperLineInput part={layoutPart} readOnly={disabled} value={value} onChange={(next) => context.onFieldChange?.(part.fieldKey, next)} inTable={context.inTable} />;
}

function slotValue(part: EditorSlotInline, context: RenderContext) {
  const fixed = fixedReferenceValue(part, context.referenceValues);
  if (fixed != null) return fixed;
  if (part.referenceFieldKey) return context.values[part.referenceFieldKey] ?? context.referenceValues?.[part.referenceFieldKey] ?? "";
  return context.values[part.fieldKey] ?? part.defaultValue ?? "";
}

function fixedReferenceValue(part: EditorSlotInline, referenceValues?: EditorRuntimeValues) {
  if (!referenceValues) return undefined;
  if (part.fieldKey === "batch_number") return referenceValues.__qc_ref_batch_number;
  if (part.fieldKey.endsWith("/signature/inspector")) return referenceValues.__qc_ref_inspector;
  if (part.fieldKey.endsWith("/signature/reviewer")) return referenceValues.__qc_ref_reviewer;
  return undefined;
}

function fieldDefinition(fieldModel: FieldModel, fieldKey: string) {
  if (Array.isArray(fieldModel.fields)) return fieldModel.fields.find((field) => field.fieldKey === fieldKey || field.key === fieldKey);
  return fieldModel.fields[fieldKey];
}
