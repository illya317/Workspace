import type { EditorBlock, EditorFieldModel, EditorInlinePart, JsonObject } from "./editor-adapter-types";

type SlotKind = NonNullable<EditorInlinePart["slotKind"]>;
type Counters = { x: number; y: number; z: number };

export function annotateEditorSlots(blocks: EditorBlock[], fieldModel: EditorFieldModel) {
  const counters = new Map<string, Counters>();
  const formulaInputs = formulaInputFields(fieldModel);
  visitParts(blocks, (part) => {
    if (part.type === "text") return;
    const field = fieldModel.fields[part.fieldKey];
    const kind = slotKind(part, field, formulaInputs);
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
  rewriteFormulaReferences(blocks, fieldModel);
}

function visitParts(blocks: EditorBlock[], visit: (part: EditorInlinePart) => void) {
  blocks.forEach((block) => {
    if (block.type === "paragraph") block.parts.forEach(visit);
    if (block.type === "table") block.rows.forEach((row) => row.cells.forEach((cell) => cell.parts.forEach(visit)));
  });
}

function slotKind(part: Exclude<EditorInlinePart, { type: "text" }>, field: EditorFieldModel["fields"][string] | undefined, formulaInputs: Set<string>): SlotKind {
  if (part.type === "signatureSlot") return "person";
  if (part.type !== "formulaSlot" && formulaInputs.has(part.fieldKey)) return "variable";
  if (part.type === "dateSlot") return formulaInputs.has(part.fieldKey) ? "variable" : "plain";
  if (part.type === "formulaSlot") return isReference(part) ? "reference" : "formula";
  if (isChoiceInput(part)) return "choice";
  if (isZField(part, field)) return "reference";
  if (field?.attr === "fillable" && (field.valueType === "number" || field.inputType === "number" || field.inputType === "field")) return "variable";
  return "plain";
}

function isChoiceInput(part: Exclude<EditorInlinePart, { type: "text" }>) {
  return part.type === "fieldSlot" && (part.inputType === "radio" || part.inputType === "checkbox" || part.inputType === "select");
}

function isReference(part: Exclude<EditorInlinePart, { type: "text" }>) {
  const partReferenceFieldKey = "referenceFieldKey" in part ? part.referenceFieldKey : undefined;
  const partValueSource = "valueSource" in part ? part.valueSource : undefined;
  return !!(partReferenceFieldKey || partValueSource?.fieldKey || partValueSource?.field_key);
}

function slotAlias(kind: SlotKind, counters: Counters) {
  if (kind === "person") return "人名";
  if (kind === "variable") return `x${++counters.x}`;
  if (kind === "formula") return `y${++counters.y}`;
  if (kind === "reference") return `z${++counters.z}`;
  return "i";
}

function formulaInputFields(fieldModel: EditorFieldModel) {
  const keys = new Set<string>();
  Object.values(fieldModel.formulas).forEach((formula) => {
    formula.dependencyFieldKeys.forEach((fieldKey) => keys.add(fieldKey));
  });
  return keys;
}

function rewriteFormulaReferences(blocks: EditorBlock[], fieldModel: EditorFieldModel) {
  const references = formulaReferenceMap(blocks, fieldModel);
  const rewrite = (formulaText: string | undefined, scope: string) => formulaText ? replaceFormulaReferences(formulaText, references.get(scope) ?? new Map()) : formulaText;
  Object.values(fieldModel.formulas).forEach((formula) => {
    const scope = definitionScope(formula);
    formula.formulaText = rewrite(formula.formulaText, scope);
    formula.rule = rewrite(formula.rule, scope);
  });
  visitParts(blocks, (part) => {
    if (part.type !== "formulaSlot") return;
    const scope = sourceScope(part);
    part.formulaText = rewrite(part.formulaText, scope);
    if (part.formulaTextMap) {
      part.formulaTextMap = Object.fromEntries(Object.entries(part.formulaTextMap).map(([key, value]) => [key, rewrite(value, scope) ?? value]));
    }
    part.formulaText = selectionWeightedFormula(part, references.get(scope) ?? new Map()) ?? part.formulaText;
    const formula = fieldModel.formulas[part.fieldKey];
    if (formula) formula.formulaText = part.formulaText;
  });
}

function formulaReferenceMap(blocks: EditorBlock[], fieldModel: EditorFieldModel) {
  const references = new Map<string, Map<string, string>>();
  visitParts(blocks, (part) => {
    if (part.type === "text" || !part.alias) return;
    addFormulaReference(references, sourceScope(part), referenceNames(part, fieldModel), part.alias);
  });
  Object.values(fieldModel.fields).forEach((field) => {
    if (field.alias) addFormulaReference(references, definitionScope(field), [field.fieldKey, field.name], field.alias);
  });
  Object.values(fieldModel.formulas).forEach((formula) => {
    if (formula.alias) addFormulaReference(references, definitionScope(formula), [formula.fieldKey, fieldModel.fields[formula.fieldKey]?.name], formula.alias);
  });
  return references;
}

function referenceNames(part: Exclude<EditorInlinePart, { type: "text" }>, fieldModel: EditorFieldModel) {
  const field = fieldModel.fields[part.fieldKey];
  const formula = fieldModel.formulas[part.fieldKey];
  return [part.fieldKey, partLabel(part), field?.name, formula?.fieldKey, ...microbiologyCountNames(part.fieldKey)];
}

function microbiologyCountNames(fieldKey: string) {
  const match = fieldKey.match(/^layout\/microbiology\/(?:aerobic|mold_yeast)\/(1_\d+)_([ab])_day(\d+)$/);
  if (!match) return [];
  return [`${match[1].replace("_", ":")} 平皿${match[2].toUpperCase()}第${match[3]}天`];
}

function addFormulaReference(references: Map<string, Map<string, string>>, scope: string, names: Array<string | undefined>, alias: string) {
  const scopeReferences = references.get(scope) ?? new Map<string, string>();
  references.set(scope, scopeReferences);
  names.filter(isFormulaReferenceName).forEach((name) => {
    if (!scopeReferences.has(name)) scopeReferences.set(name, alias);
  });
}

function replaceFormulaReferences(formulaText: string, references: Map<string, string>) {
  return [...references.entries()]
    .sort(([left], [right]) => right.length - left.length)
    .reduce((text, [name, alias]) => text.replace(new RegExp(escapeRegExp(name), "g"), alias), formulaText);
}

function selectionWeightedFormula(part: Extract<EditorInlinePart, { type: "formulaSlot" }>, references: Map<string, string>) {
  if (!part.formulaTextMap || !part.dependencyFieldKeyMap) return null;
  const choices = Object.keys(part.formulaTextMap);
  if (choices.length < 2) return null;
  const selectorKey = choices
    .flatMap((choice) => part.dependencyFieldKeyMap?.[choice] ?? [])
    .find((fieldKey) => isChoiceAlias(references.get(fieldKey)));
  const selectorAlias = selectorKey ? references.get(selectorKey) : undefined;
  if (!selectorAlias) return null;

  const terms = choices.map((choice) => {
    const inputs = (part.dependencyFieldKeyMap?.[choice] ?? [])
      .map((fieldKey) => references.get(fieldKey))
      .filter((alias): alias is string => !!alias && alias !== selectorAlias && /^x\d+$/i.test(alias));
    if (inputs.length < 2) return null;
    const weight = `${selectorAlias} = ${JSON.stringify(choice)}`;
    return { sum: `(${inputs.join(" + ")})`, weight: `(${weight})` };
  }).filter((term): term is { sum: string; weight: string } => !!term);
  if (terms.length !== choices.length) return null;
  const numerator = terms.map((term) => `${term.weight} * ${term.sum}`).join(" + ");
  const denominator = terms.map((term) => term.weight).join(" + ");
  return `(${numerator}) / (2 * (${denominator}))`;
}

function isChoiceAlias(alias: string | undefined) {
  return !!alias && /^x\d+$/i.test(alias);
}

function isFormulaReferenceName(name: string | undefined): name is string {
  if (!name || name.length < 2) return false;
  if (/^[xyz]\d+$/i.test(name) || /^\d+(?:\.\d+)?$/.test(name)) return false;
  return !["ABS", "AVG", "RD", "RSD", "SUM", "SQRT", "MIN", "MAX", "IF", "AND", "OR"].includes(name.toUpperCase());
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

function definitionScope(value: { source?: JsonObject; metadata?: JsonObject }) {
  const metadataSource = (value.metadata?.source ?? {}) as JsonObject;
  const source = value.source ?? metadataSource;
  return [source.productKey, source.stageKey, source.testKey].filter(Boolean).join("/") || "global";
}

function isZField(part: Exclude<EditorInlinePart, { type: "text" }>, field: EditorFieldModel["fields"][string] | undefined) {
  const text = `${part.fieldKey} ${partLabel(part)} ${field?.name ?? ""}`;
  return text.includes("批号") && !text.includes("batch_number");
}

function partLabel(part: Exclude<EditorInlinePart, { type: "text" }>) {
  return "label" in part ? part.label ?? "" : "";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
