import type { EditorSlotInline, FieldDefinition, FieldModel } from "@workspace/platform/document-editor";
import type { EditorRuntimeValues } from "./useEditorRuntimeFormulaEngine";

export interface QcEditorRuntimeFieldContext {
  fieldModel: FieldModel;
  values: EditorRuntimeValues;
  referenceValues?: EditorRuntimeValues;
  onFieldChange?: (key: string, value: string) => void;
  readOnly?: boolean;
}

export interface ResolvedQcEditorRuntimeField {
  value: string;
  field: FieldDefinition | undefined;
  rawInputType: string;
  inputType: string;
  options: string[] | undefined;
  valueType: string | undefined;
  disabled: boolean;
}

export function resolveQcEditorRuntimeField(
  part: EditorSlotInline,
  context: QcEditorRuntimeFieldContext,
): ResolvedQcEditorRuntimeField {
  const field = qcFieldDefinition(context.fieldModel, part.fieldKey);
  const rawInputType = part.inputType
    || field?.inputType
    || (field?.type === "date" ? "date" : undefined)
    || (part.type === "dateSlot" ? "date" : "text");
  const options = part.options ?? field?.options;
  const inputType = qcNormalizedInputType(rawInputType, options);
  const valueType = part.valueType || field?.valueType || qcInferredValueType(part, field, rawInputType);
  return {
    value: qcRuntimeSlotValue(part, context),
    field,
    rawInputType,
    inputType,
    options,
    valueType,
    disabled: Boolean(
      context.readOnly
      || !context.onFieldChange
      || part.readonlyDisplay
      || part.slotKind === "formula"
      || part.slotKind === "reference"
      || part.referenceFieldKey,
    ),
  };
}

export function qcFieldDefinition(fieldModel: FieldModel, fieldKey: string) {
  if (Array.isArray(fieldModel.fields)) {
    return fieldModel.fields.find((field) => field.fieldKey === fieldKey || field.key === fieldKey);
  }
  return fieldModel.fields[fieldKey];
}

export function qcNormalizedInputType(rawInputType: string, options?: string[]) {
  if (rawInputType === "number") return "text";
  if (rawInputType === "field") return options?.length ? "select" : "text";
  if (rawInputType === "boolean") return "radio";
  return rawInputType;
}

export function qcInferredValueType(
  part: EditorSlotInline,
  field: FieldDefinition | undefined,
  rawInputType: string,
) {
  if (part.withTime || rawInputType === "datetime") return "datetime";
  if (rawInputType === "date" || part.type === "dateSlot" || field?.type === "date") return "date";
  if (rawInputType === "boolean" || field?.type === "boolean") return "boolean";
  if (rawInputType === "checkbox") return "array";
  if (part.inputType === "number" || field?.inputType === "number" || field?.type === "number") return "number";
  if (field?.type === "line" || field?.type === "field") return "text";
  return field?.type;
}

function qcRuntimeSlotValue(part: EditorSlotInline, context: QcEditorRuntimeFieldContext) {
  const fixed = fixedReferenceValue(part, context.referenceValues);
  if (fixed != null) return fixed;
  if (part.referenceFieldKey) {
    return context.values[part.referenceFieldKey] ?? context.referenceValues?.[part.referenceFieldKey] ?? "";
  }
  return context.values[part.fieldKey] ?? part.defaultValue ?? "";
}

function fixedReferenceValue(part: EditorSlotInline, referenceValues?: EditorRuntimeValues) {
  if (!referenceValues) return undefined;
  if (part.fieldKey === "batch_number") return referenceValues.__qc_ref_batch_number;
  if (part.fieldKey.endsWith("/signature/inspector")) return referenceValues.__qc_ref_inspector;
  if (part.fieldKey.endsWith("/signature/reviewer")) return referenceValues.__qc_ref_reviewer;
  return undefined;
}
