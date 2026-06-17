"use client";
import { useEffect, type CSSProperties, type ReactNode } from "react";
import type { QcLayoutBlock, QcLayoutCell, QcLayoutPart, QcTemplateMethodField, QcTemplateTestItem } from "@/server/services/production/qc";
import { QcPaperChoiceInput, QcPaperLineInput, QcPaperSelectInput, qcRangeError, qcRangeLabel } from "./QcPaperInputs";
import { QcPaperDateInput } from "./QcPaperDateInput";
import { MicrobialSelectedTotalPart } from "./QcMicrobialComputedParts";
import type { QcFieldValues } from "./useQcFormulaEngine";
const TABLE_BODY_TEXT_CLASS = "text-[15px] leading-8 text-slate-950 tabular-nums";
const TABLE_HEADING_TEXT_CLASS = "text-[17px] font-semibold leading-7 text-slate-950";
export interface LayoutRenderContext {
  test?: QcTemplateTestItem;
  values: QcFieldValues;
  onFieldChange: (key: string, value: string) => void;
  fieldByName: Map<string, QcTemplateMethodField>;
  fieldByKey: Map<string, QcTemplateMethodField>;
  readonlyDisplayKeys?: Set<string>;
  firstPartByKey?: Map<string, QcLayoutPart>;
  formulaInputKeys?: Set<string>;
  formulaDependencies?: Map<string, Set<string>>;
  advancedPartMetadata?: Map<string, QcLayoutPart>;
  sectionAliases?: Record<string, string>;
  inTable?: boolean;
  advancedMode?: boolean;
  activeAdvancedOutputKey?: string | null;
  onAdvancedOutputHover?: (fieldKey: string | null) => void;
}

function advancedBadgePalette(kind: "formulaInput" | "formulaOutput" | "reference" | "input" | "date" | "param") {
  if (kind === "formulaOutput" || kind === "reference" || kind === "param") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function AdvancedFieldBadge({
  label,
  kind,
  title,
  formulaText,
  active = false,
  highlighted = false,
  fieldKey,
  anchorKey,
  onToggle,
}: {
  label: string;
  kind: "formulaInput" | "formulaOutput" | "reference" | "input" | "date" | "param";
  title?: string;
  formulaText?: string;
  active?: boolean;
  highlighted?: boolean;
  fieldKey?: string;
  anchorKey?: string;
  onToggle?: (fieldKey: string | null) => void;
}) {
  const clickable = !!fieldKey && !!onToggle;
  return (
    <span
      className="relative mx-1 inline-flex overflow-visible align-middle"
      data-inline-feedback={anchorKey ? "true" : undefined}
      data-inline-feedback-kind={anchorKey ? "field" : undefined}
      data-inline-feedback-key={anchorKey || undefined}
      data-inline-feedback-label={title || anchorKey || label}
      data-inline-feedback-badge-kind={kind}
    >
      <span
        title={title}
        onClick={clickable ? () => onToggle(active ? null : fieldKey || null) : undefined}
        className={`inline-flex min-h-7 min-w-[3rem] items-center justify-center rounded-md border px-2 py-0.5 text-[12px] font-semibold leading-5 transition-colors ${
          active
            ? kind === "formulaOutput" || kind === "reference" || kind === "param"
              ? "border-red-400 bg-red-100 text-red-800 shadow-sm"
              : "border-emerald-400 bg-emerald-100 text-emerald-800 shadow-sm"
            : highlighted
              ? "border-amber-300 bg-amber-50 text-amber-800 shadow-sm"
              : advancedBadgePalette(kind)
        } ${clickable ? "cursor-pointer select-none" : ""}`}
      >
        {label}
      </span>
      {active && formulaText ? (
        <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 inline-block w-max max-w-[min(24rem,60vw)] -translate-x-1/2 whitespace-normal rounded-md border border-slate-200/80 bg-white/80 px-3 py-2 text-left text-[12px] font-normal leading-5 text-slate-700 shadow-lg backdrop-blur-sm [overflow-wrap:anywhere]">
          {formulaText}
        </span>
      ) : null}
    </span>
  );
}

function AdvancedParamText({ text, title, anchorKey }: { text: string; title?: string; anchorKey?: string }) {
  return (
    <span
      title={title}
      className="mx-1 inline-block border-b border-red-300 px-0.5 text-red-700"
      data-inline-feedback={anchorKey ? "true" : undefined}
      data-inline-feedback-kind={anchorKey ? "field" : undefined}
      data-inline-feedback-key={anchorKey || undefined}
      data-inline-feedback-label={title || text}
      data-inline-feedback-badge-kind={anchorKey ? "param" : undefined}
    >
      {text}
    </span>
  );
}
function defaultValueForPart(part: QcLayoutPart, test?: QcTemplateTestItem) {
  if (part.defaultValue) return part.defaultValue;
  if (part.field === "重量差异限度") return test?.standardText?.match(/±\s*([\d.]+)\s*%/)?.[1];
  return undefined;
}

function scopePrefix(fieldKey: string) {
  const parts = fieldKey.split("/");
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}/` : `${fieldKey}/`;
}

function isReferenceFormula(field: QcTemplateMethodField | undefined, test?: QcTemplateTestItem) {
  if (!field || field.attr !== "calculated" || !field.formula) return false;
  const expr = field.formula
    .replace(/\s+/g, "")
    .replace(/（/g, "(")
    .replace(/）/g, ")");
  if (!expr) return false;
  if (/[<>=!&|+\-*/%^(),"'.0-9]/.test(expr) || expr.includes("ALL(") || expr.includes("Math.")) return false;
  const fields = test?.methodGroups.flatMap((group) => group.fields) || [];
  const prefix = scopePrefix(field.fieldKey);
  return fields.some((candidate) => candidate.fieldKey !== field.fieldKey && candidate.fieldKey.startsWith(prefix) && candidate.name === expr);
}

function advancedLabelForField(
  kind: "formulaInput" | "formulaOutput" | "reference" | "input",
  fieldType?: string,
) {
  if (kind === "reference") return "ref";
  if (kind === "formulaOutput") return "f(x)";
  if (kind === "formulaInput") return "x";
  if (fieldType === "checkbox" || fieldType === "radio") return "✓";
  return "i";
}

function resolvePartField(
  part: QcLayoutPart,
  test: QcTemplateTestItem | undefined,
  fieldByName: Map<string, QcTemplateMethodField>,
  fieldByKey: Map<string, QcTemplateMethodField>,
) {
  const occurrence = Math.max(1, part.occurrence || 1);
  const fields = test?.methodGroups.flatMap((group) => group.fields) || [];
  const matches = part.field ? fields.filter((candidate) => candidate.name === part.field) : [];
  const field = part.field && occurrence > 1 ? matches[occurrence - 1] : part.field ? fieldByName.get(part.field) : undefined;
  const key = part.fieldKey || field?.fieldKey || part.field || part.name || "";
  return { key, field: fieldByKey.get(key) || field };
}

function highlightedInputKey(
  activeAdvancedOutputKey: string | null | undefined,
  formulaDependencies: Map<string, Set<string>> | undefined,
  key: string,
  advancedOutputDependencies: Set<string>,
) {
  if (!activeAdvancedOutputKey) return false;
  if (activeAdvancedOutputKey === key) return true;
  if (formulaDependencies?.get(activeAdvancedOutputKey)?.has(key)) return true;
  return advancedOutputDependencies.has(key);
}

function resolveAdvancedFormulaText(part: QcLayoutPart, values: QcFieldValues, field?: QcTemplateMethodField) {
  const selectorKey = part.advancedFormulaValueFieldKey;
  const selectorValue = selectorKey ? String(values[selectorKey] || "").trim() : "";
  if (selectorValue && part.advancedFormulaTextMap?.[selectorValue]) return part.advancedFormulaTextMap[selectorValue];
  if (part.type === "duration_days" && part.startKey && part.endKey) {
    return `${part.endKey} - ${part.startKey}（天）`;
  }
  if (part.type === "duration_hours" && part.startKey && part.endKey) {
    const startHourKey = part.startHourKey || `${part.startKey}_hour`;
    const endHourKey = part.endHourKey || `${part.endKey}_hour`;
    return `${part.endKey} ${endHourKey} - ${part.startKey} ${startHourKey}（小时）`;
  }
  return part.advancedFormulaText || String(field?.formula || field?.rule || "") || undefined;
}

function resolveAdvancedDependencyKeys(part: QcLayoutPart, values: QcFieldValues) {
  const keys = new Set(part.advancedDependencyFieldKeys || []);
  if (part.startKey) keys.add(part.startKey);
  if (part.endKey) keys.add(part.endKey);
  if (part.type === "duration_hours") {
    if (part.startHourKey || part.startKey) keys.add(part.startHourKey || `${part.startKey}_hour`);
    if (part.endHourKey || part.endKey) keys.add(part.endHourKey || `${part.endKey}_hour`);
  }
  for (const value of Object.values(part.advancedDependencyFieldKeyMap || {})) {
    for (const key of value) keys.add(key);
  }
  return keys;
}

function isReadonlyReferencePart(part: QcLayoutPart, field?: QcTemplateMethodField) {
  if (!part.readonlyDisplay) return false;
  if (!(part.fieldKey || field?.fieldKey || part.field || part.name)) return false;
  return field?.attr !== "calculated";
}
function parseDateValue(value?: string) {
  const parts = String(value || "").slice(0, 10).split("-");
  if (parts.length !== 3) return undefined;
  const [year, month, day] = parts.map((part) => Number(part));
  if (![year, month, day].every(Number.isFinite)) return undefined;
  return Date.UTC(year, month - 1, day);
}

function parseDateHourValue(dateValue?: string, hourValue?: string) {
  const date = parseDateValue(dateValue);
  const hour = Number(String(hourValue || "").replace(/\D/g, ""));
  if (date == null || !Number.isFinite(hour) || hour < 0 || hour > 23) return undefined;
  return date + hour * 60 * 60 * 1000;
}

function durationValue(part: QcLayoutPart, values: QcFieldValues, unit: "days" | "hours") {
  const startKey = part.startKey;
  const endKey = part.endKey;
  if (!startKey || !endKey) return "";
  if (unit === "days") {
    const start = parseDateValue(values[startKey]);
    const end = parseDateValue(values[endKey]);
    return start == null || end == null ? "" : String(Math.max(0, Math.round((end - start) / 86400000)));
  }
  const start = parseDateHourValue(values[startKey], values[part.startHourKey || `${startKey}_hour`]);
  const end = parseDateHourValue(values[endKey], values[part.endHourKey || `${endKey}_hour`]);
  return start == null || end == null ? "" : String(Math.max(0, Math.round((end - start) / 3600000)));
}

function DurationPart({ part, context, unit }: { part: QcLayoutPart; context: LayoutRenderContext; unit: "days" | "hours" }) {
  const key = part.fieldKey || part.field || part.name || "";
  const computed = durationValue(part, context.values, unit);
  const value = computed || context.values[key] || "";
  const error = qcRangeError(part, value);
  const hasReadonlyDependencies = !!(
    context.readonlyDisplayKeys?.has(part.startKey || "")
    || context.readonlyDisplayKeys?.has(part.endKey || "")
    || context.readonlyDisplayKeys?.has(part.startHourKey || "")
    || context.readonlyDisplayKeys?.has(part.endHourKey || "")
  );
  const isFirstDisplay = context.firstPartByKey?.get(key) === part;
  const isReferenceOutput = hasReadonlyDependencies && !isFirstDisplay;
  useEffect(() => {
    if (key && computed && context.values[key] !== computed) context.onFieldChange(key, computed);
  }, [computed, context, key]);
  if (context.advancedMode) {
    return (
      <AdvancedFieldBadge
        label={isReferenceOutput ? "ref" : "f(x)"}
        kind={isReferenceOutput ? "reference" : "formulaOutput"}
        title={part.fieldKey || part.field || part.name}
        formulaText={resolveAdvancedFormulaText(part, context.values)}
        fieldKey={key}
        anchorKey={key}
        active={!!key && context.activeAdvancedOutputKey === key}
        onToggle={context.onAdvancedOutputHover}
      />
    );
  }
  return (
    <span
      data-field-key={key}
      title={error}
      className={`mx-1 inline-block min-w-[3em] text-right tabular-nums align-baseline ${error ? "text-red-700" : ""} ${value ? "" : "text-slate-400"}`}
      style={{ width: part.width || "4em" }}
    >
      {value || part.placeholder || qcRangeLabel(part)}
    </span>
  );
}

function stripPlaceholder(text: string) {
  return text.replace(/\s*[＿_]{2,}\s*[。.]?/g, "");
}

function testValue(part: QcLayoutPart, test?: QcTemplateTestItem) {
  const path = part.path || part.field || "";
  let value = "";
  if (path === "standard") value = test?.standardText || "";
  else if (path === "name") value = test?.name || "";
  else if (path === "method") value = test?.methodName || "";
  if (!value) value = part.defaultValue || "";
  return part.stripPlaceholder ? stripPlaceholder(value) : value;
}

function isCompactFormCell(cell: QcLayoutCell) {
  const isFormPart = (part: QcLayoutPart) => ["line", "field", "select", "date", "duration_days", "duration_hours", "radio", "checkbox", "microbial_selected_total"].includes(part.type);
  if (!cell.parts.some(isFormPart)) return false;
  const textLength = cell.parts.filter((part) => !isFormPart(part)).map((part) => part.text || part.defaultValue || part.name || "").join("").trim().length;
  return !cell.rawText?.trim() && textLength <= 12;
}

function isFormLikePart(part: QcLayoutPart) {
  return ["line", "field", "select", "date", "duration_days", "duration_hours", "radio", "checkbox", "microbial_selected_total"].includes(part.type);
}

function isShortUnitTextPart(part: QcLayoutPart | undefined) {
  if (!part || part.type !== "text") return false;
  const text = (part.text || "").trim();
  if (!text || text.length > 8) return false;
  return /^[A-Za-z0-9%℃°μ/]+$/.test(text);
}

function joinSectionSuffix(base?: string, suffix?: string) {
  if (!base) return suffix || "";
  if (!suffix || suffix === "auto") return base;
  return `${base}.${suffix}`;
}

function sectionHeadingText(part: QcLayoutPart, context: LayoutRenderContext) {
  const aliases = context.sectionAliases || {};
  const suffix = part.sectionRef ? joinSectionSuffix(aliases[part.sectionRef], part.sectionSuffix) : part.sectionSuffix;
  const section = context.test?.sequence && suffix ? `${context.test.sequence}.${suffix}` : suffix;
  return section ? `${section} ${part.text || ""}` : part.text;
}

export function Part({ part, context }: { part: QcLayoutPart; context: LayoutRenderContext }) {
  const { test, values, onFieldChange, fieldByName, fieldByKey, formulaInputKeys, formulaDependencies, advancedMode, activeAdvancedOutputKey, onAdvancedOutputHover } = context;
  const activeAdvancedPart = activeAdvancedOutputKey ? context.advancedPartMetadata?.get(activeAdvancedOutputKey) : undefined;
  const advancedDependencyKeys = activeAdvancedPart ? resolveAdvancedDependencyKeys(activeAdvancedPart, values) : new Set<string>();
  if (part.type === "br") return <br />;
  if (part.type === "duration_days") return <DurationPart part={part} context={context} unit="days" />;
  if (part.type === "duration_hours") return <DurationPart part={part} context={context} unit="hours" />;
  if (part.type === "microbial_selected_total" && advancedMode) {
    const fieldKey = part.fieldKey || part.field || part.name;
    return (
      <AdvancedFieldBadge
        label="f(x)"
        kind="formulaOutput"
        title={fieldKey}
        formulaText={resolveAdvancedFormulaText(part, values)}
        fieldKey={fieldKey}
        active={activeAdvancedOutputKey === fieldKey}
        onToggle={onAdvancedOutputHover}
      />
    );
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
    if (advancedMode) {
      const isReferenceOutput = isReferenceFormula(field, test) || isReadonlyReferencePart(part, field);
      const isFormulaOutput = field?.attr === "calculated" && !isReferenceOutput;
      const isFormulaInput = !!key && formulaInputKeys?.has(key);
      const kind = isReferenceOutput ? "reference" : isFormulaOutput ? "formulaOutput" : isFormulaInput ? "formulaInput" : "input";
      const label = advancedLabelForField(kind, fieldType);
      const badgeFieldKey = key || part.field || part.name;
      const formulaText = isReferenceOutput || isFormulaOutput || part.advancedFormulaText || part.advancedFormulaTextMap
        ? resolveAdvancedFormulaText(part, values, field)
        : undefined;
      return (
        <AdvancedFieldBadge
          label={label}
          kind={kind}
          title={field?.name || badgeFieldKey}
          formulaText={formulaText}
          fieldKey={kind === "formulaOutput" || kind === "reference" ? badgeFieldKey : undefined}
          anchorKey={key || badgeFieldKey}
          active={(kind === "formulaOutput" || kind === "reference") && !!badgeFieldKey && activeAdvancedOutputKey === badgeFieldKey}
          highlighted={!!key && highlightedInputKey(activeAdvancedOutputKey, formulaDependencies, key, advancedDependencyKeys)}
          onToggle={kind === "formulaOutput" || kind === "reference" ? onAdvancedOutputHover : undefined}
        />
      );
    }
    if (fieldType === "radio" || fieldType === "checkbox") {
      return (
        <QcPaperChoiceInput
          fieldKey={key}
          options={part.options?.length ? part.options : field?.options}
          type={fieldType}
          disabled={part.readonlyDisplay || field?.attr === "calculated"}
          value={values[key]}
          onChange={(value) => onFieldChange(key, value)}
        />
      );
    }
    if (fieldType === "select" || (!!part.options?.length && fieldType !== "radio" && fieldType !== "checkbox")) {
      return (
        <QcPaperSelectInput
          part={mergedPart}
          options={part.options?.length ? part.options : field?.options}
          readOnly={part.readonlyDisplay || field?.attr === "calculated"}
          value={values[key]}
          onChange={(value) => onFieldChange(key, value)}
          inTable={context.inTable}
        />
      );
    }
    return (
      <QcPaperLineInput
        part={mergedPart}
        readOnly={part.readonlyDisplay || field?.attr === "calculated"}
        value={values[key]}
        onChange={(value) => onFieldChange(key, value)}
        inTable={context.inTable}
      />
    );
  }
  if (part.type === "date") {
    const key = part.fieldKey || part.field || part.name || "date";
    if (advancedMode) {
      const field = fieldByKey.get(key);
      const isReferenceOutput = isReadonlyReferencePart(part, field);
      return (
        <AdvancedFieldBadge
          label={isReferenceOutput ? "ref" : "date"}
          kind={isReferenceOutput ? "reference" : "date"}
          title={key}
          highlighted={highlightedInputKey(activeAdvancedOutputKey, formulaDependencies, key, advancedDependencyKeys)}
          fieldKey={isReferenceOutput ? key : undefined}
          anchorKey={key}
          active={isReferenceOutput && activeAdvancedOutputKey === key}
          onToggle={isReferenceOutput ? onAdvancedOutputHover : undefined}
        />
      );
    }
    return (
      <QcPaperDateInput
        part={{ ...part, fieldKey: key }}
        value={values[key]}
        hourValue={values[`${key}_hour`]}
        onChange={(value) => onFieldChange(key, value)}
        onHourChange={(value) => onFieldChange(`${key}_hour`, value)}
        readOnly={part.readonlyDisplay}
      />
    );
  }
  if (part.type === "radio" || part.type === "checkbox") {
    const { key, field } = resolvePartField(part, test, fieldByName, fieldByKey);
    if (advancedMode) {
      const isReferenceOutput = isReferenceFormula(field, test) || isReadonlyReferencePart(part, field);
      const isFormulaOutput = field?.attr === "calculated" && !isReferenceOutput;
      const isFormulaInput = !!key && formulaInputKeys?.has(key);
      const kind = isReferenceOutput ? "reference" : isFormulaOutput ? "formulaOutput" : isFormulaInput ? "formulaInput" : "input";
      const label = advancedLabelForField(kind, part.type);
      const formulaText = isReferenceOutput || isFormulaOutput || part.advancedFormulaText || part.advancedFormulaTextMap
        ? resolveAdvancedFormulaText(part, values, field)
        : undefined;
      return (
        <AdvancedFieldBadge
          label={label}
          kind={kind}
          title={field?.name || key}
          formulaText={formulaText}
          fieldKey={kind === "formulaOutput" || kind === "reference" ? key : undefined}
          anchorKey={key}
          active={(kind === "formulaOutput" || kind === "reference") && activeAdvancedOutputKey === key}
          highlighted={!!key && highlightedInputKey(activeAdvancedOutputKey, formulaDependencies, key, advancedDependencyKeys)}
          onToggle={kind === "formulaOutput" || kind === "reference" ? onAdvancedOutputHover : undefined}
        />
      );
    }
    return <QcPaperChoiceInput fieldKey={key} options={part.options?.length ? part.options : field?.options} type={part.type} disabled={part.readonlyDisplay || field?.attr === "calculated"} value={values[key]} onChange={(value) => onFieldChange(key, value)} />;
  }
  if (part.type === "param") {
    if (advancedMode) {
      const text = part.defaultValue || part.name || "p";
      return <AdvancedParamText text={text} title={part.name || part.defaultValue || text} anchorKey={`param:${part.name || part.defaultValue || text}`} />;
    }
    return <span>{part.defaultValue || part.name}</span>;
  }
  if (part.type === "note" || part.type === "hint") return <span className="text-slate-700">{part.text}</span>;
  return part.bold ? <strong>{part.text}</strong> : <span>{part.text}</span>;
}

function CellContent({ cell, context }: { cell: QcLayoutCell; context: LayoutRenderContext }) {
  if (cell.parts.length === 0) {
    if (!cell.rawText) return <span>&nbsp;</span>;
    if (cell.header || cell.bold) {
      return (
        <span
          className="inline-block"
          data-inline-feedback="true"
          data-inline-feedback-kind="heading"
          data-inline-feedback-key={`heading:${cell.rawText}`}
          data-inline-feedback-label={cell.rawText}
        >
          {cell.rawText}
        </span>
      );
    }
    return <span>{cell.rawText}</span>;
  }
  const cellContext = { ...context, inTable: true };
  const content: ReactNode[] = [];
  for (let index = 0; index < cell.parts.length; index += 1) {
    const part = cell.parts[index];
    const next = cell.parts[index + 1];
    const key = `${part.fieldKey || part.field || part.text || part.type}-${index}`;
    if (context.advancedMode && isFormLikePart(part) && isShortUnitTextPart(next)) {
      content.push(
        <span key={`${key}-unit`} className="inline-flex items-center whitespace-nowrap">
          <Part part={part} context={cellContext} />
          <Part part={next} context={cellContext} />
        </span>,
      );
      index += 1;
      continue;
    }
    content.push(<Part key={key} part={part} context={cellContext} />);
  }
  if (!isCompactFormCell(cell)) return <>{content}</>;
  return (
    <span
      className={`flex min-h-8 w-full ${context.advancedMode ? "items-center flex-wrap" : "items-baseline flex-wrap"} ${cell.align === "left" ? "justify-start" : cell.align === "right" ? "justify-end" : "justify-center"} gap-x-0.5 gap-y-1`}
    >
      {content}
    </span>
  );
}

export function TableBlock({ block, className = "", context }: { block: QcLayoutBlock; className?: string; context: LayoutRenderContext }) {
  if (!block.rows?.length) return null;
  return (
    <table className={`mb-4 w-full table-fixed border-collapse ${TABLE_BODY_TEXT_CLASS} ${className}`}>
      {block.columnWidths?.length ? (
        <colgroup>
          {block.columnWidths.map((width, index) => <col key={`${width}-${index}`} style={{ width }} />)}
        </colgroup>
      ) : null}
      <tbody>
        {block.rows.map((row, rowIndex) => (
          <tr key={rowIndex} style={block.rowHeights?.[rowIndex] ? { height: block.rowHeights[rowIndex] } : undefined}>
            {row.map((cell, cellIndex) => {
              const Tag = cell.header ? "th" : "td";
              const textAlign = (cell.align || "center") as CSSProperties["textAlign"];
              const textClass = cell.bold && !cell.header ? TABLE_HEADING_TEXT_CLASS : "";
              return (
                <Tag
                  key={`${rowIndex}-${cellIndex}`}
                  colSpan={cell.colspan}
                  rowSpan={cell.rowspan}
                  className={`border border-slate-950 px-2 py-1.5 align-middle ${cell.bold || cell.header ? "font-semibold" : "font-normal"} ${textClass} ${cell.isEmpty ? "text-transparent" : ""} ${cell.className || ""}`}
                  style={{ textAlign, width: cell.width }}
                >
                  <CellContent cell={cell} context={context} />
                </Tag>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
