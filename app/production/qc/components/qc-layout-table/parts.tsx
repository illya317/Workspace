"use client";

import type { QcLayoutPart } from "@/server/services/production/qc";
import { MicrobialSelectedTotalPart } from "../QcMicrobialComputedParts";
import { QcPaperDateInput } from "../QcPaperDateInput";
import { QcPaperChoiceInput, QcPaperLineInput, QcPaperSelectInput } from "../QcPaperInputs";
import { AdvancedFieldBadge, AdvancedParamText } from "./badges";
import { DurationPart } from "./duration-part";
import {
  advancedLabelForField,
  defaultValueForPart,
  hasAdvancedFormulaMetadata,
  highlightedInputKey,
  isReadonlyReferencePart,
  isReferenceFormula,
  referenceDisplayValue,
  referenceFormulaText,
  resolveAdvancedDependencyKeys,
  resolveAdvancedFormulaText,
  resolvePartField,
  sectionHeadingText,
  testValue,
} from "./helpers";
import type { LayoutRenderContext } from "./types";

export function Part({ part, context }: { part: QcLayoutPart; context: LayoutRenderContext }) {
  const { test, values, onFieldChange, fieldByName, fieldByKey, advancedMode, activeAdvancedOutputKey, onAdvancedOutputHover } = context;
  const activeAdvancedPart = activeAdvancedOutputKey ? context.advancedPartMetadata?.get(activeAdvancedOutputKey) : undefined;
  const advancedDependencyKeys = activeAdvancedPart ? resolveAdvancedDependencyKeys(activeAdvancedPart) : new Set<string>();
  if (part.type === "br") return <br />;
  if (part.type === "duration_days") return <DurationPart part={part} context={context} unit="days" />;
  if (part.type === "duration_hours") return <DurationPart part={part} context={context} unit="hours" />;
  if (part.type === "microbial_selected_total" && advancedMode) {
    const fieldKey = part.fieldKey || part.field || part.name;
    return <AdvancedFieldBadge label="f(x)" kind="formulaOutput" title={fieldKey} formulaText={resolveAdvancedFormulaText(part, values)} fieldKey={fieldKey} active={activeAdvancedOutputKey === fieldKey} onToggle={onAdvancedOutputHover} />;
  }
  if (part.type === "microbial_selected_total") return <MicrobialSelectedTotalPart part={part} context={context} />;
  if (part.type === "test_value") return <span>{testValue(part, test)}</span>;
  if (part.type === "section_heading") {
    const text = sectionHeadingText(part, context);
    const key = part.sectionRef || part.sectionSuffix || text;
    const attrs = {
      "data-inline-feedback": "true",
      "data-inline-feedback-kind": "heading",
      "data-inline-feedback-key": `heading:${key}`,
      "data-inline-feedback-label": text || "",
    };
    return part.bold ? <strong {...attrs}>{text}</strong> : <span {...attrs}>{text}</span>;
  }
  if (part.type === "line" || part.type === "field" || part.type === "select") {
    const { key, field } = resolvePartField(part, test, fieldByName, fieldByKey);
    const mergedPart = { ...part, fieldKey: key, defaultValue: defaultValueForPart(part, test) || field?.defaultValue };
    const fieldType = part.type === "select" ? "select" : part.inputType || field?.type;
    const sourceKey = key ? context.referenceSourceKeyFor?.(key) : undefined;
    const isWholeTestReference = !!sourceKey;
    const hasLayoutFormula = hasAdvancedFormulaMetadata(part);
    if (advancedMode) return renderAdvancedField({ part, key, field, fieldType, sourceKey, hasLayoutFormula, context, advancedDependencyKeys });
    if (fieldType === "radio" || fieldType === "checkbox") {
      return <QcPaperChoiceInput fieldKey={key} options={part.options?.length ? part.options : field?.options} type={fieldType} disabled={isWholeTestReference || part.readonlyDisplay || field?.attr === "calculated"} value={referenceDisplayValue(context, key) ?? values[key]} onChange={(value) => onFieldChange(key, value)} />;
    }
    if (fieldType === "select" || (!!part.options?.length && fieldType !== "radio" && fieldType !== "checkbox")) {
      return <QcPaperSelectInput part={mergedPart} options={part.options?.length ? part.options : field?.options} readOnly={isWholeTestReference || part.readonlyDisplay || field?.attr === "calculated"} value={referenceDisplayValue(context, key) ?? values[key]} onChange={(value) => onFieldChange(key, value)} inTable={context.inTable} />;
    }
    return <QcPaperLineInput part={mergedPart} readOnly={isWholeTestReference || part.readonlyDisplay || field?.attr === "calculated"} value={referenceDisplayValue(context, key) ?? values[key]} onChange={(value) => onFieldChange(key, value)} inTable={context.inTable} />;
  }
  if (part.type === "date") return renderDatePart(part, context, advancedDependencyKeys);
  if (part.type === "radio" || part.type === "checkbox") {
    const { key, field } = resolvePartField(part, test, fieldByName, fieldByKey);
    const sourceKey = key ? context.referenceSourceKeyFor?.(key) : undefined;
    const hasLayoutFormula = hasAdvancedFormulaMetadata(part);
    if (advancedMode) return renderAdvancedField({ part, key, field, fieldType: part.type, sourceKey, hasLayoutFormula, context, advancedDependencyKeys });
    return <QcPaperChoiceInput fieldKey={key} options={part.options?.length ? part.options : field?.options} type={part.type} disabled={!!sourceKey || part.readonlyDisplay || field?.attr === "calculated"} value={referenceDisplayValue(context, key) ?? values[key]} onChange={(value) => onFieldChange(key, value)} />;
  }
  if (part.type === "param") {
    if (advancedMode) {
      const text = part.defaultValue || part.name || "p";
      const title = part.name && part.defaultValue ? `${part.name} = ${part.defaultValue}` : part.name || part.defaultValue || text;
      return <AdvancedParamText text={text} title={title} anchorKey={`param:${part.name || part.defaultValue || text}`} />;
    }
    return <span>{part.defaultValue || part.name}</span>;
  }
  if (part.type === "note" || part.type === "hint") return <span className="text-slate-700">{part.text}</span>;
  return part.bold ? <strong>{part.text}</strong> : <span>{part.text}</span>;
}

function renderAdvancedField({ part, key, field, fieldType, sourceKey, hasLayoutFormula, context, advancedDependencyKeys }: {
  part: QcLayoutPart;
  key: string;
  field: ReturnType<typeof resolvePartField>["field"];
  fieldType?: string;
  sourceKey?: string;
  hasLayoutFormula: boolean;
  context: LayoutRenderContext;
  advancedDependencyKeys: Set<string>;
}) {
  const isReferenceOutput = !!sourceKey || (!hasLayoutFormula && (isReferenceFormula(field, context.test) || isReadonlyReferencePart(part, field)));
  const isFormulaOutput = (hasLayoutFormula || field?.attr === "calculated") && !isReferenceOutput;
  const isFormulaInput = !!key && context.formulaInputKeys?.has(key);
  const kind = isReferenceOutput ? "reference" : isFormulaOutput ? "formulaOutput" : isFormulaInput ? "formulaInput" : "input";
  const badgeFieldKey = key || part.field || part.name;
  const formulaText = sourceKey ? referenceFormulaText(sourceKey) : isReferenceOutput || isFormulaOutput || part.advancedFormulaText || part.advancedFormulaTextMap ? resolveAdvancedFormulaText(part, context.values, field) : undefined;
  return (
    <AdvancedFieldBadge
      label={advancedLabelForField(kind, fieldType)}
      kind={kind}
      title={field?.name || badgeFieldKey}
      formulaText={formulaText}
      fieldKey={kind === "formulaOutput" || kind === "reference" ? badgeFieldKey : undefined}
      anchorKey={key || badgeFieldKey}
      active={(kind === "formulaOutput" || kind === "reference") && !!badgeFieldKey && context.activeAdvancedOutputKey === badgeFieldKey}
      highlighted={!!key && highlightedInputKey(context.activeAdvancedOutputKey, context.formulaDependencies, key, advancedDependencyKeys)}
      onToggle={kind === "formulaOutput" || kind === "reference" ? context.onAdvancedOutputHover : undefined}
    />
  );
}

function renderDatePart(part: QcLayoutPart, context: LayoutRenderContext, advancedDependencyKeys: Set<string>) {
  const key = part.fieldKey || part.field || part.name || "date";
  const sourceKey = context.referenceSourceKeyFor?.(key);
  if (context.advancedMode) {
    const field = context.fieldByKey.get(key);
    const isReferenceOutput = !!sourceKey || isReadonlyReferencePart(part, field);
    return <AdvancedFieldBadge label={isReferenceOutput ? "ref" : "date"} kind={isReferenceOutput ? "reference" : "date"} title={key} formulaText={referenceFormulaText(sourceKey)} highlighted={highlightedInputKey(context.activeAdvancedOutputKey, context.formulaDependencies, key, advancedDependencyKeys)} fieldKey={isReferenceOutput ? key : undefined} anchorKey={key} active={isReferenceOutput && context.activeAdvancedOutputKey === key} onToggle={isReferenceOutput ? context.onAdvancedOutputHover : undefined} />;
  }
  return <QcPaperDateInput part={{ ...part, fieldKey: key }} value={sourceKey ? context.values[sourceKey] : context.values[key]} hourValue={sourceKey ? context.values[`${sourceKey}_hour`] : context.values[`${key}_hour`]} onChange={(value) => context.onFieldChange(key, value)} onHourChange={(value) => context.onFieldChange(`${key}_hour`, value)} readOnly={!!sourceKey || part.readonlyDisplay} />;
}
