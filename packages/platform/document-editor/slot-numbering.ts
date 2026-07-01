import type { EditorDocument, EditorSlotInline } from "./types";

export type NumberedSlotKind = "plain" | "choice" | "variable" | "formula" | "reference";

const numberedPrefixes: Record<NumberedSlotKind, "i" | "x" | "y" | "z"> = {
  plain: "i",
  choice: "i",
  variable: "x",
  formula: "y",
  reference: "z",
};

export function numberedSlotKind(value: unknown): NumberedSlotKind | null {
  return value === "plain" || value === "choice" || value === "variable" || value === "formula" || value === "reference" ? value : null;
}

export function numberedSlotPrefix(kind: NumberedSlotKind) {
  return numberedPrefixes[kind];
}

export function nextAvailableSlotAlias(document: EditorDocument, kind: NumberedSlotKind, context: string, excludeFieldKey?: string) {
  const prefix = numberedSlotPrefix(kind);
  if (usesFixedAlias(kind)) return prefix;
  const used = new Set<number>();
  walkEditorSlots(document, (part) => {
    if (excludeFieldKey && part.fieldKey === excludeFieldKey) return;
    if (slotContextLabel(part) !== context) return;
    const partKind = numberedSlotKind(effectiveNumberedKind(part));
    if (!partKind || numberedSlotPrefix(partKind) !== prefix) return;
    const match = part.alias?.trim().match(new RegExp(`^${prefix}(\\d+)$`, "i"));
    if (match) used.add(Number(match[1]));
  });
  let index = 1;
  while (used.has(index)) index += 1;
  return `${prefix}${index}`;
}

export function validateNumberedAlias(attrs: EditorSlotInline, document?: EditorDocument) {
  const kind = numberedSlotKind(effectiveNumberedKind(attrs));
  if (!kind) return null;
  const alias = attrs.alias?.trim().toLowerCase() ?? "";
  const prefix = numberedSlotPrefix(kind);
  if (usesFixedAlias(kind)) {
    return alias === prefix ? null : `编号必须是 ${prefix}`;
  }
  if (!new RegExp(`^${prefix}\\d+$`, "i").test(alias)) {
    return `编号必须是 ${prefix}+数字`;
  }
  if (!document) return null;
  const context = slotContextLabel(attrs);
  let conflict = false;
  walkEditorSlots(document, (part) => {
    if (part.fieldKey === attrs.fieldKey) return;
    if (slotContextLabel(part) !== context) return;
    if (part.alias?.trim().toLowerCase() === alias) conflict = true;
  });
  return conflict ? `编号已存在：${alias}` : null;
}

export function slotContextLabel(part: EditorSlotInline) {
  const metadata = part.metadata;
  const source = isRecord(metadata?.source) ? metadata.source : isRecord(metadata) ? metadata : {};
  const product = stringValue(source.productName);
  const stage = stringValue(source.stageLabel);
  const sequence = stringValue(source.sequence);
  const test = stringValue(source.testName);
  return [product, stage, [sequence, test].filter(Boolean).join(" ")].filter(Boolean).join(" / ");
}

export function walkEditorSlots(document: EditorDocument, visit: (part: EditorSlotInline) => void) {
  document.blocks.forEach((block) => {
    if (block.type === "paragraph") block.parts.forEach((part) => { if (part.type !== "text") visit(part); });
    if (block.type === "table") block.rows.forEach((row) => row.cells.forEach((cell) => cell.parts.forEach((part) => { if (part.type !== "text") visit(part); })));
  });
}

function effectiveNumberedKind(attrs: EditorSlotInline) {
  if (attrs.slotKind === "reference" || attrs.referenceFieldKey) return "reference";
  if (attrs.slotKind === "date" || attrs.type === "dateSlot") return "plain";
  if (attrs.slotKind === "plain") return "plain";
  if (attrs.slotKind === "choice" || isOptionSlot(attrs)) return "choice";
  if (attrs.slotKind === "variable") return "variable";
  if (attrs.slotKind === "formula" || attrs.type === "formulaSlot") return "formula";
  return attrs.slotKind;
}

function isOptionSlot(attrs: EditorSlotInline) {
  return attrs.inputType === "radio" || attrs.inputType === "checkbox" || attrs.inputType === "select";
}

function usesFixedAlias(kind: NumberedSlotKind) {
  return kind === "plain" || kind === "choice";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}
