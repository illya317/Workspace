"use client";

import { createDocumentSection, PaperInputSurface, type BodySurfaceSectionSpec, type PaperInputLayoutSpec } from "@workspace/core/ui";
import { DocumentPreview, type EditorBlock, type EditorDocument, type EditorSlotInline, type FieldModel } from "@workspace/platform/document-editor";
import { resolveQcEditorRuntimeField } from "./qc-editor-runtime-field";
import type { EditorRuntimeValues } from "./useEditorRuntimeFormulaEngine";

export interface QcEditorRuntimePaperProps {
  blocks: EditorBlock[];
  fieldModel: FieldModel;
  values: EditorRuntimeValues;
  referenceValues?: EditorRuntimeValues;
  onFieldChange?: (key: string, value: string) => void;
  readOnly?: boolean;
}

type RenderContext = QcEditorRuntimePaperProps & { inTable?: boolean };

export default function QcEditorRuntimePaper({ blocks, fieldModel, values, referenceValues, onFieldChange, readOnly = false }: QcEditorRuntimePaperProps) {
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

/** @ui-specialized-surface QC runtime paper is one reviewed document section, not a set of field-level declarations. */
export function createQcEditorRuntimePaperSection(key: string, props: QcEditorRuntimePaperProps): BodySurfaceSectionSpec {
  return createDocumentSection(key, {
    kind: "pages",
    pages: {
      items: [{ key: "paper", size: "a4", content: <QcEditorRuntimePaper {...props} /> }],
    },
  });
}

function RuntimeSlot({ part, context }: { part: EditorSlotInline; context: RenderContext }) {
  const { value, field, rawInputType, options, inputType, valueType, disabled } = resolveQcEditorRuntimeField(part, context);
  const layout: PaperInputLayoutSpec = {
    fieldKey: part.fieldKey,
    width: part.width ? String(part.width) : "3rem",
    align: paperInputAlign(part.align),
    valueType: paperInputValueType(valueType),
    numberFormat: paperInputNumberFormat(part.numberFormat || field?.numberFormat),
    precision: part.precision ?? field?.precision,
    defaultValue: part.defaultValue,
    defaultOffsetDays: part.defaultOffsetDays,
    placeholder: part.placeholder,
    readonlyDisplay: disabled,
    withTime: part.withTime || valueType === "datetime" || rawInputType === "datetime",
    underline: part.display !== "plain",
  };

  if (part.type === "dateSlot" || inputType === "date" || inputType === "datetime") {
    return <PaperInputSurface kind="date" layout={layout} value={value} hourValue={context.values[`${part.fieldKey}_hour`]} onChange={(next) => context.onFieldChange?.(part.fieldKey, next)} onHourChange={(next) => context.onFieldChange?.(`${part.fieldKey}_hour`, next)} readOnly={disabled} placement={context.inTable ? "table" : "inline"} />;
  }
  if (inputType === "radio" || inputType === "checkbox") {
    return <PaperInputSurface kind="choice" fieldKey={part.fieldKey} options={options ?? []} multiple={inputType === "checkbox"} readOnly={disabled} value={value} onChange={(next) => context.onFieldChange?.(part.fieldKey, next)} />;
  }
  if (inputType === "select" || options?.length) {
    return <PaperInputSurface kind="select" layout={layout} options={options ?? []} readOnly={disabled} value={value} onChange={(next) => context.onFieldChange?.(part.fieldKey, next)} placement={context.inTable ? "table" : "inline"} />;
  }
  return <PaperInputSurface kind="line" layout={layout} readOnly={disabled} value={value} onChange={(next) => context.onFieldChange?.(part.fieldKey, next)} placement={context.inTable ? "table" : "inline"} />;
}

function paperInputValueType(valueType: string | undefined): PaperInputLayoutSpec["valueType"] {
  if (valueType === "number" || valueType === "date" || valueType === "datetime") return valueType;
  return "text";
}

function paperInputAlign(align: string | undefined): PaperInputLayoutSpec["align"] {
  if (align === "left" || align === "right") return align;
  return "center";
}

function paperInputNumberFormat(format: string | undefined): PaperInputLayoutSpec["numberFormat"] {
  if (format === "round_half_even" || format === "ceil" || format === "floor" || format === "truncate") return format;
  return "round";
}
