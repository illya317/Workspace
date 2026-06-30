import type { EditorBlock, EditorFieldModel, EditorInlinePart, JsonObject } from "./editor-adapter-types";

type SlotKind = NonNullable<EditorInlinePart["slotKind"]>;
type Counters = { x: number; y: number; z: number };

export function annotateEditorSlots(blocks: EditorBlock[], fieldModel: EditorFieldModel) {
  const counters = new Map<string, Counters>();
  visitParts(blocks, (part) => {
    if (part.type === "text") return;
    const field = fieldModel.fields[part.fieldKey];
    const kind = slotKind(part, field);
    const alias = slotAlias(kind, counter(counters, sourceScope(part)));
    part.slotKind = kind;
    part.alias = alias;
    if (field) {
      field.slotKind = kind;
      field.alias = alias;
    }
    const formula = fieldModel.formulas[part.fieldKey];
    if (formula) {
      formula.slotKind = kind;
      formula.alias = alias;
    }
  });
}

function visitParts(blocks: EditorBlock[], visit: (part: EditorInlinePart) => void) {
  blocks.forEach((block) => {
    if (block.type === "paragraph") block.parts.forEach(visit);
    if (block.type === "table") block.rows.forEach((row) => row.cells.forEach((cell) => cell.parts.forEach(visit)));
  });
}

function slotKind(part: Exclude<EditorInlinePart, { type: "text" }>, field: EditorFieldModel["fields"][string] | undefined): SlotKind {
  if (part.type === "signatureSlot") return "person";
  if (part.type === "dateSlot") return "date";
  if (part.type === "formulaSlot") return isReference(part, field) ? "reference" : "formula";
  if (part.inputType === "radio" || part.inputType === "checkbox" || part.inputType === "select") return "choice";
  if (isZField(part, field)) return "reference";
  if (field?.attr === "fillable" && (field.valueType === "number" || field.inputType === "number" || field.inputType === "field")) return "variable";
  return "plain";
}

function isReference(part: Exclude<EditorInlinePart, { type: "text" }>, field: EditorFieldModel["fields"][string] | undefined) {
  const partReferenceFieldKey = "referenceFieldKey" in part ? part.referenceFieldKey : undefined;
  const partValueSource = "valueSource" in part ? part.valueSource : undefined;
  const valueSource = partValueSource || field?.valueSource;
  return !!(partReferenceFieldKey || field?.referenceFieldKey || valueSource?.fieldKey || valueSource?.field_key);
}

function slotAlias(kind: SlotKind, counters: Counters) {
  if (kind === "person") return "人名";
  if (kind === "date") return "日期";
  if (kind === "variable") return `x${++counters.x}`;
  if (kind === "formula") return `y${++counters.y}`;
  if (kind === "reference") return `z${++counters.z}`;
  return "i";
}

function counter(counters: Map<string, Counters>, scope: string) {
  const value = counters.get(scope) ?? { x: 0, y: 0, z: 0 };
  counters.set(scope, value);
  return value;
}

function sourceScope(part: Exclude<EditorInlinePart, { type: "text" }>) {
  const source = ((part.metadata as JsonObject | undefined)?.source ?? {}) as JsonObject;
  return [source.productKey, source.stageKey, source.testKey].filter(Boolean).join("/") || "global";
}

function isZField(part: Exclude<EditorInlinePart, { type: "text" }>, field: EditorFieldModel["fields"][string] | undefined) {
  const text = `${part.fieldKey} ${partLabel(part)} ${field?.name ?? ""}`;
  return text.includes("batch_number") || text.includes("批号");
}

function partLabel(part: Exclude<EditorInlinePart, { type: "text" }>) {
  return "label" in part ? part.label ?? "" : "";
}
