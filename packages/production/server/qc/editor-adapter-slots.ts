import type { EditorBlock, EditorFieldDefinition, EditorFieldModel, EditorInlinePart, JsonObject } from "./editor-adapter-types";
import { normalizeFormulaText } from "../../../platform/formula/parser";

type SlotKind = NonNullable<EditorInlinePart["slotKind"]>;
type Counters = { x: number; y: number; z: number };

export function annotateEditorSlots(blocks: EditorBlock[], fieldModel: EditorFieldModel) {
  insertMissingFormulaInputSlots(blocks, fieldModel);
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

function insertMissingFormulaInputSlots(blocks: EditorBlock[], fieldModel: EditorFieldModel) {
  const presentFieldKeys = collectPresentFieldKeys(blocks);
  const missingByScope = new Map<string, EditorFieldDefinition[]>();
  Object.values(fieldModel.formulas).forEach((formula) => {
    const scope = definitionScope(formula);
    formula.dependencyFieldKeys.forEach((fieldKey) => {
      if (presentFieldKeys.has(fieldKey)) return;
      const field = fieldModel.fields[fieldKey];
      if (!field || !shouldMaterializeFormulaInput(field)) return;
      const fields = missingByScope.get(scope) ?? [];
      if (!fields.some((candidate) => candidate.fieldKey === field.fieldKey)) fields.push(field);
      missingByScope.set(scope, fields);
      presentFieldKeys.add(fieldKey);
    });
  });

  [...missingByScope.entries()].reverse().forEach(([scope, fields]) => {
    const index = blocks.findIndex((block) => blockNeedsFormulaInputs(block, fieldModel, fields));
    if (index < 0) return;
    blocks.splice(index, 0, syntheticFormulaInputBlock(scope, fields));
  });
}

function collectPresentFieldKeys(blocks: EditorBlock[]) {
  const keys = new Set<string>();
  visitParts(blocks, (part) => {
    if (part.type !== "text") keys.add(part.fieldKey);
  });
  return keys;
}

function shouldMaterializeFormulaInput(field: EditorFieldDefinition) {
  if (constantFieldReplacement(field)) return false;
  if (field.referenceFieldKey || field.valueSource) return false;
  return field.attr === "fillable";
}

function blockNeedsFormulaInputs(block: EditorBlock, fieldModel: EditorFieldModel, fields: EditorFieldDefinition[]) {
  const missingFieldKeys = new Set(fields.map((field) => field.fieldKey));
  return blockInlineParts(block).some((part) => {
    if (part.type === "text" || part.type !== "formulaSlot") return false;
    const formula = fieldModel.formulas[part.fieldKey];
    const dependencies = formula?.dependencyFieldKeys ?? part.dependencyFieldKeys ?? [];
    return dependencies.some((fieldKey) => missingFieldKeys.has(fieldKey));
  });
}

function syntheticFormulaInputBlock(scope: string, fields: EditorFieldDefinition[]): EditorBlock {
  const firstSource = (fields[0]?.source ?? fields[0]?.metadata?.source ?? {}) as JsonObject;
  return {
    id: `qc:formula-inputs:${scope.replace(/[^a-z0-9:_-]+/gi, "_")}`,
    type: "paragraph",
    parts: fields.flatMap((field, index) => syntheticFormulaInputParts(field, index > 0)),
    metadata: {
      source: firstSource,
      syntheticRole: "formulaInputs",
    },
  };
}

function syntheticFormulaInputParts(field: EditorFieldDefinition, withGap: boolean): EditorInlinePart[] {
  const source = (field.source ?? field.metadata?.source ?? {}) as JsonObject;
  return [
    ...(withGap ? [{ type: "text" as const, text: "　" }] : []),
    { type: "text", text: `${field.name ?? field.fieldKey}: ` },
    {
      type: "fieldSlot",
      fieldKey: field.fieldKey,
      label: field.name,
      inputType: field.inputType ?? (field.valueType === "number" ? "number" : "field"),
      options: field.options,
      defaultValue: field.defaultValue,
      readonlyDisplay: false,
      width: "3rem",
      metadata: {
        source,
        syntheticRole: "formulaInput",
      },
    },
    ...(field.unit ? [{ type: "text" as const, text: field.unit }] : []),
  ];
}

function blockInlineParts(block: EditorBlock) {
  if (block.type === "paragraph") return block.parts;
  if (block.type === "table") return block.rows.flatMap((row) => row.cells.flatMap((cell) => cell.parts));
  return [];
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
  clearReferenceFormulaTexts(blocks, fieldModel);
  const references = formulaReferenceMap(blocks, fieldModel);
  const rewrite = (formulaText: string | undefined, scope: string, alias?: string) => {
    return formulaText ? canonicalFormulaText(formulaText, references.get(scope) ?? new Map(), alias) : formulaText;
  };
  Object.values(fieldModel.formulas).forEach((formula) => {
    const scope = definitionScope(formula);
    formula.formulaText = rewrite(formula.formulaText, scope, formula.alias);
    formula.rule = rewrite(formula.rule, scope, formula.alias);
  });
  visitParts(blocks, (part) => {
    if (part.type !== "formulaSlot") return;
    const scope = sourceScope(part);
    part.formulaText = rewrite(part.formulaText, scope, part.alias);
    if (part.formulaTextMap) {
      part.formulaTextMap = Object.fromEntries(Object.entries(part.formulaTextMap).map(([key, value]) => [key, rewrite(value, scope, part.alias) ?? value]));
    }
    part.formulaText = selectionWeightedFormula(part, references.get(scope) ?? new Map()) ?? part.formulaText;
    const formula = fieldModel.formulas[part.fieldKey];
    if (formula) formula.formulaText = part.formulaText;
  });
  clearHiddenFormulaTexts(fieldModel);
}

function clearReferenceFormulaTexts(blocks: EditorBlock[], fieldModel: EditorFieldModel) {
  Object.values(fieldModel.formulas).forEach((formula) => {
    if (!formula.referenceFieldKey) return;
    delete formula.formulaText;
    delete formula.rule;
  });
  visitParts(blocks, (part) => {
    if (part.type !== "formulaSlot" || !isReference(part)) return;
    delete part.formulaText;
  });
}

function clearHiddenFormulaTexts(fieldModel: EditorFieldModel) {
  Object.values(fieldModel.formulas).forEach((formula) => {
    if (formula.alias) return;
    delete formula.formulaText;
    delete formula.rule;
  });
}

function formulaReferenceMap(blocks: EditorBlock[], fieldModel: EditorFieldModel) {
  const references = new Map<string, Map<string, string>>();
  visitParts(blocks, (part) => {
    if (part.type === "text" || !part.alias) return;
    addFormulaReference(references, sourceScope(part), referenceNames(part, fieldModel), part.alias);
  });
  Object.values(fieldModel.fields).forEach((field) => {
    const replacement = field.alias ?? constantFieldReplacement(field);
    if (!replacement) return;
    addFormulaReference(references, definitionScope(field), [field.fieldKey, field.fieldKey.split("/").at(-1), field.name].flatMap(referenceNameVariants), replacement);
  });
  Object.values(fieldModel.formulas).forEach((formula) => {
    if (formula.alias) {
      addFormulaReference(
        references,
        definitionScope(formula),
        [formula.fieldKey, formula.fieldKey.split("/").at(-1), fieldModel.fields[formula.fieldKey]?.name].flatMap(referenceNameVariants),
        formula.alias,
      );
    }
  });
  for (let index = 0; index < 3; index += 1) addHiddenFormulaReferences(references, fieldModel);
  return references;
}

function addHiddenFormulaReferences(references: Map<string, Map<string, string>>, fieldModel: EditorFieldModel) {
  Object.values(fieldModel.formulas).forEach((formula) => {
    if (formula.alias) return;
    const rawFormulaText = formula.formulaText || formula.rule;
    if (!rawFormulaText) return;
    const scope = definitionScope(formula);
    const scopeReferences = references.get(scope) ?? new Map<string, string>();
    const replacement = formulaReferenceReplacement(canonicalFormulaText(rawFormulaText, scopeReferences));
    addFormulaReference(
      references,
      scope,
      [formula.fieldKey, formula.fieldKey.split("/").at(-1), fieldModel.fields[formula.fieldKey]?.name].flatMap(referenceNameVariants),
      replacement,
      true,
    );
  });
}

function referenceNames(part: Exclude<EditorInlinePart, { type: "text" }>, fieldModel: EditorFieldModel) {
  const field = fieldModel.fields[part.fieldKey];
  const formula = fieldModel.formulas[part.fieldKey];
  return [
    part.fieldKey,
    part.fieldKey.split("/").at(-1),
    partLabel(part),
    field?.name,
    formula?.fieldKey,
    formula?.fieldKey.split("/").at(-1),
    ...microbiologyCountNames(part.fieldKey),
  ].flatMap(referenceNameVariants);
}

function microbiologyCountNames(fieldKey: string) {
  const match = fieldKey.match(/^layout\/microbiology\/(?:aerobic|mold_yeast)\/(1_\d+)_([ab])_day(\d+)$/);
  if (!match) return [];
  return [`${match[1].replace("_", ":")} 平皿${match[2].toUpperCase()}第${match[3]}天`];
}

function addFormulaReference(
  references: Map<string, Map<string, string>>,
  scope: string,
  names: Array<string | undefined>,
  alias: string,
  replace = false,
) {
  const scopeReferences = references.get(scope) ?? new Map<string, string>();
  references.set(scope, scopeReferences);
  names.filter(isFormulaReferenceName).forEach((name) => {
    if (replace || !scopeReferences.has(name)) scopeReferences.set(name, alias);
  });
}

function replaceFormulaReferences(formulaText: string, references: Map<string, string>) {
  return formulaText.split(/(\{[^}]*\}|\[[^\]]*\])/g).map((part) => {
    if (/^(?:\{[^}]*\}|\[[^\]]*\])$/.test(part)) return part;
    return [...references.entries()]
      .sort(([left], [right]) => right.length - left.length)
      .reduce((text, [name, alias]) => text.replace(new RegExp(escapeRegExp(name), "g"), alias), part);
  }).join("");
}

function canonicalFormulaText(formulaText: string, references: Map<string, string>, alias?: string) {
  const rewrite = (text: string) => normalizeFormulaText(replaceFormulaReferences(text, references)).trim();
  const currentAlias = alias?.toLowerCase();
  let text = stripFormulaAssignment(rewrite(formulaText), currentAlias);
  text = stripTrailingFormulaUnit(text);
  return rewrite(text);
}

function stripFormulaAssignment(formulaText: string, currentAlias?: string) {
  const match = formulaText.match(/^\s*([xyz]\d+)\s*=\s*(.+)$/i);
  if (!match) return formulaText;
  const leftAlias = match[1].toLowerCase();
  if (leftAlias === currentAlias || /^[xyz]\d+$/i.test(leftAlias)) return match[2].trim();
  return formulaText;
}

function stripTrailingFormulaUnit(formulaText: string) {
  return formulaText.replace(/\s*\(\s*(?:小时|天|日|分钟|分|秒|mg|g|kg|ml|mL|L|%|℃)\s*\)\s*$/u, "").trim();
}

function formulaReferenceReplacement(formulaText: string) {
  if (/^(?:[xyz]\d+|-?\d+(?:\.\d+)?)$/i.test(formulaText)) return formulaText;
  return `(${formulaText})`;
}

function constantFieldReplacement(field: EditorFieldModel["fields"][string]) {
  const numeric = numericText(field.defaultValue) ?? numericText(field.recommendedValue);
  if (numeric) return numeric;
  const source = (field.source ?? field.metadata?.source ?? {}) as JsonObject;
  if (source.productKey === "berberine_tannate" && field.name === "规格" && field.unit === "mg") return "100";
  return null;
}

function numericText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return /^-?\d+(?:\.\d+)?$/.test(text) ? text : null;
}

function referenceNameVariants(name: string | undefined) {
  if (!name) return [];
  const trimmed = name.trim();
  const withoutUnit = trimmed.replace(/\s*[（(]\s*(?:小时|天|日|分钟|分|秒|mg|g|kg|ml|mL|L|%|℃)\s*[）)]\s*$/u, "").trim();
  const withoutSpaces = trimmed.replace(/\s+/g, "");
  return Array.from(new Set([trimmed, withoutUnit, withoutSpaces].filter(Boolean)));
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
