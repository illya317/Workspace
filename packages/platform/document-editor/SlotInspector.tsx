"use client";

import { InputSurface, type InputSurfaceProps } from "@workspace/core/ui";
import type { Editor } from "@tiptap/core";
import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { normalizeFormulaDisplayText } from "./formula-display";
import { nextAvailableSlotAlias, numberedSlotKind, slotContextLabel, validateNumberedAlias, walkEditorSlots, type NumberedSlotKind } from "./slot-numbering";
import type { EditorDocument, EditorSlotInline, EditorSlotType } from "./types";

export type SlotAnchor = { top: number; left: number };
export type SelectedSlot = { pos: number; type: EditorSlotType; attrs: EditorSlotInline; anchor: SlotAnchor };
type ReferenceToken = { fieldKey: string; label: string; alias: string; sourceLabel: string; context: string };
type FormulaDisplayToken = { fieldKey: string; alias: string; labels: string[]; context: string; formulaText?: string };
type SlotPatch = Record<string, unknown>;
type InspectorField = {
  key: string;
  label: string;
  span?: "half" | "full";
  spec: InputSurfaceProps["spec"];
  value?: InputSurfaceProps["value"];
  placeholder?: string;
  rows?: number;
  resize?: InputSurfaceProps["resize"];
  visualState?: InputSurfaceProps["visualState"];
  error?: string;
  onChange?: InputSurfaceProps["onChange"];
};
type InspectorSection = { key: string; title?: string; fields: InspectorField[] };

export function SlotInspector({
  editor,
  editable,
  selectedSlot,
  setSelectedSlot,
  tokens,
  formulaTokens,
  getReferenceTokens,
  getCurrentDocument,
}: {
  editor: Editor;
  editable: boolean;
  selectedSlot: SelectedSlot | null;
  setSelectedSlot: (slot: SelectedSlot | null) => void;
  tokens: ReferenceToken[];
  formulaTokens: FormulaDisplayToken[];
  getReferenceTokens?: () => ReferenceToken[];
  getCurrentDocument?: () => EditorDocument;
}) {
  const attrs = selectedSlot?.attrs;
  const selectedType = selectedSlot?.type;
  const [draft, setDraft] = useState<EditorSlotInline | null>(null);
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    setDraft(attrs && selectedType ? cloneSlotAttrs(attrs, selectedType) : null);
    setValidationError("");
  }, [attrs, selectedType]);

  const update = (patch: SlotPatch) => {
    setValidationError("");
    setDraft((current) => current ? mergeSlotAttrs(current, patch) : current);
  };
  const save = () => {
    if (!selectedSlot || !draft) return;
    const validation = validateSlotDraft(draft, getReferenceTokens?.() ?? tokens, getCurrentDocument?.());
    if (validation.ok === false) {
      setValidationError(validation.error);
      return;
    }
    editor.chain().focus(undefined, { scrollIntoView: false }).setNodeSelection(selectedSlot.pos).updateAttributes(selectedSlot.type, nodeAttributes(validation.attrs)).run();
    setSelectedSlot(null);
  };
  const cancel = () => setSelectedSlot(null);
  if (!attrs || !draft || !selectedType) return null;
  const inspectorSections = createInspectorSections({
    attrs: draft,
    editable,
    selectedType,
    tokens,
    formulaTokens,
    update,
    validationError,
    allocateAlias: (kind, attrs) => allocateAlias(kind, attrs, getCurrentDocument?.()),
  });
  return (
    <aside
      className="absolute z-50 w-[320px] overflow-visible rounded-lg border border-slate-200 bg-white text-xs shadow-2xl"
      style={{ top: selectedSlot.anchor.top, left: selectedSlot.anchor.left }}
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`inline-flex h-7 min-w-10 items-center justify-center rounded-md border px-2 font-mono text-sm font-semibold ${slotToneClass(draft)}`}>
            {draft.alias || slotKindShortName(draft)}
          </span>
          <span className="truncate text-sm font-semibold text-slate-900">{slotTypeLabel(draft, selectedType)}</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="保存" title="保存" disabled={!editable} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-emerald-600 transition hover:bg-white disabled:text-slate-300" onClick={save}>
            <Check size={16} strokeWidth={2} />
          </button>
          <button type="button" aria-label="取消" title="取消" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-white hover:text-slate-700" onClick={cancel}>
            <X size={16} strokeWidth={2} />
          </button>
        </div>
      </div>
      <div key={`${selectedSlot.pos}:${selectedSlot.type}`} className="space-y-4 px-4 py-3">
        {inspectorSections.map((section) => (
          <section key={section.key} className="space-y-3">
            {section.title ? (
              <div className="border-b border-slate-200 pb-2 text-sm font-semibold text-slate-900">{section.title}</div>
            ) : null}
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {section.fields.map((field) => (
                <label key={field.key} className={`min-w-0 space-y-1 ${field.span === "full" ? "col-span-2" : ""}`}>
                  <span className="block text-xs font-medium text-slate-500">{field.label}</span>
                  <InputSurface
                    spec={field.spec}
                    value={field.value}
                    placeholder={field.placeholder}
                    density="compact"
                    size="md"
                    rows={field.rows}
                    resize={field.resize}
                    visualState={field.visualState}
                    onChange={field.onChange}
                  />
                  {field.error ? <span className="block text-xs font-medium text-red-600">{field.error}</span> : null}
                </label>
              ))}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}

function createInspectorSections({
  attrs,
  editable,
  selectedType,
  tokens,
  formulaTokens,
  update,
  validationError,
  allocateAlias,
}: {
  attrs: EditorSlotInline;
  editable: boolean;
  selectedType: EditorSlotType;
  tokens: ReferenceToken[];
  formulaTokens: FormulaDisplayToken[];
  update: (patch: SlotPatch) => void;
  validationError: string;
  allocateAlias: (kind: NumberedSlotKind, attrs: EditorSlotInline) => string;
}) {
  const disabledState = editable ? "normal" as const : "disabled" as const;
  const aliasState = numberedSlotKind(effectiveSlotKind(attrs)) ? "readonly" as const : disabledState;
  const sections: InspectorSection[] = [{
    key: "base",
    title: "基础属性",
    fields: [
      selectedType === "signatureSlot"
        ? { key: "type", label: "类型", spec: { valueType: "string", control: "text", state: "readonly" }, value: "系统签名" }
        : {
            key: "type",
            label: "类型",
            spec: { valueType: "string", control: "choice", options: { source: "static", items: slotKindOptions(), mode: "dropdown", searchPlaceholder: "搜索类型" }, state: disabledState },
            value: effectiveSlotKind(attrs),
            onChange: (value) => {
              const nextKind = String(value || "");
              const numberedKind = numberedSlotKind(nextKind);
              update(slotKindPatch(nextKind, attrs, numberedKind ? allocateAlias(numberedKind, attrs) : undefined));
            },
          },
      ...(supportsAlias(attrs, selectedType) ? [{ key: "alias", label: "编号", spec: { valueType: "string", control: "text", state: aliasState }, value: attrs.alias ?? "", visualState: validationError.startsWith("编号") ? "error" : "default", error: validationError.startsWith("编号") ? validationError : undefined, onChange: (value) => update({ alias: String(value ?? "") }) } satisfies InspectorField] : []),
      ...(supportsInputMethod(attrs, selectedType) ? [{
        key: "inputMethod",
        label: "输入方式",
        spec: { valueType: "string", control: "choice", options: { source: "static", items: inputMethodOptions(), mode: "dropdown", searchPlaceholder: "选择输入方式" }, state: disabledState },
        value: inputMethod(attrs),
        onChange: (value) => update(inputMethodPatch(String(value || "text"), attrs)),
      } satisfies InspectorField] : []),
      { key: "label", label: "标签", spec: { valueType: "string", control: "text", state: disabledState }, value: attrs.label ?? "", onChange: (value) => update({ label: String(value ?? "") }) },
      ...(supportsPlaceholder(attrs) ? [{ key: "placeholder", label: "占位提示", spec: { valueType: "string", control: "text", state: disabledState }, value: attrs.placeholder ?? "", onChange: (value) => update({ placeholder: String(value ?? "") }) } satisfies InspectorField] : []),
      { key: "width", label: "下划线", spec: { valueType: "number", control: "number", validation: { min: 0 }, state: disabledState }, value: widthNumber(attrs.width), onChange: (value) => update({ width: remWidth(value) }) },
    ],
  }];

  const ruleFields: InspectorField[] = [];
  if (isOptionSlot(attrs)) {
    ruleFields.push({
      key: "options",
      label: "选项",
      span: "full",
      spec: { valueType: "array", control: "collection", itemControl: "text", state: disabledState },
      value: (attrs.options ?? []).join("、"),
      placeholder: "输入后按 Enter 添加",
      onChange: (value) => update({ options: splitOptions(String(value ?? "")) }),
    });
  }
  if (isFormulaSlot(attrs, selectedType)) {
    ruleFields.push({
      key: "formula",
      label: "计算式",
      span: "full",
      rows: 4,
      resize: "none",
      spec: { valueType: "string", control: "text", multiline: true, state: disabledState },
      value: formulaDisplayText(attrs, formulaTokens),
      onChange: (value) => update({ formulaText: String(value ?? ""), slotKind: "formula" }),
    });
  }
  if (isReferenceSlot(attrs)) {
    const referenceTokens = scopedReferenceTokens(attrs, tokens);
    ruleFields.push({
      key: "reference",
      label: "引用来源",
      span: "full",
      spec: { valueType: "string", control: "text", state: disabledState, validation: { required: true } },
      placeholder: "请输入引用来源编号",
      value: selectedReferenceInputValue(attrs, referenceTokens),
      visualState: validationError ? "error" : "default",
      error: validationError,
      onChange: (value) => update({ referenceFieldKey: normalizeReferenceInput(value), slotKind: "reference" }),
    });
  }
  if (ruleFields.length) {
    sections.push({
      key: "rules",
      title: ruleSectionTitle(attrs, selectedType),
      fields: ruleFields,
    });
  }

  return sections;
}

export function collectReferenceTokens(document: EditorDocument) {
  const tokens: ReferenceToken[] = [];
  walkEditorSlots(document, (part) => {
    if (part.slotKind === "plain" || part.slotKind === "choice" || part.slotKind === "date") return;
    const context = slotContextLabel(part);
    const mainLabel = part.alias ?? fallbackReferenceAlias(part);
    if (!/^[xy]\d+$/i.test(mainLabel)) return;
    tokens.push({
      fieldKey: part.fieldKey,
      label: [context, mainLabel].filter(Boolean).join(" · "),
      alias: mainLabel,
      sourceLabel: part.label ?? "",
      context,
    });
  });
  return tokens;
}

export function collectFormulaDisplayTokens(document: EditorDocument) {
  const parts: EditorSlotInline[] = [];
  walkEditorSlots(document, (part) => parts.push(part));
  const directTokens = parts.flatMap((part): FormulaDisplayToken[] => {
    const alias = formulaAlias(part);
    if (!alias) return [];
    return [{
      fieldKey: part.fieldKey,
      alias,
      labels: [part.label, part.fieldKey, part.fieldKey.split("/").at(-1)].filter((value): value is string => Boolean(value)),
      context: slotContextLabel(part),
      formulaText: part.formulaText,
    }];
  });
  const byFieldKey = new Map(directTokens.map((token) => [token.fieldKey, token]));
  const refTokens = parts.flatMap((part): FormulaDisplayToken[] => {
    if (!isReferenceSlot(part) || !part.referenceFieldKey) return [];
    const referenced = byFieldKey.get(part.referenceFieldKey);
    if (!referenced?.alias.startsWith("y")) return [];
    return [{
      fieldKey: part.fieldKey,
      alias: referenced.alias,
      labels: [part.label, part.fieldKey.split("/").at(-1)].filter((value): value is string => Boolean(value)),
      context: slotContextLabel(part),
      formulaText: referenced.formulaText,
    }];
  });
  return [...directTokens, ...refTokens];
}

function formulaAlias(part: EditorSlotInline) {
  const alias = part.alias?.trim();
  if (!alias) return "";
  if (part.slotKind === "variable" && /^x\d+$/i.test(alias)) return alias.toLowerCase();
  if ((part.slotKind === "formula" || part.type === "formulaSlot") && /^y\d+$/i.test(alias)) return alias.toLowerCase();
  return "";
}

function formulaDisplayText(attrs: EditorSlotInline, tokens: FormulaDisplayToken[]) {
  const formulaText = attrs.formulaText ?? "";
  if (!formulaText) return "";
  const currentContext = slotContextLabel(attrs);
  const scopedTokens = tokens.filter((token) => token.context === currentContext);
  const displayTokens = scopedTokens.length ? scopedTokens : tokens;
  return normalizeFormulaDisplayText(replaceFormulaLabels(formulaText, displayTokens), createFormulaAliasMap(displayTokens));
}

function scopedReferenceTokens(attrs: EditorSlotInline, tokens: ReferenceToken[]) {
  const currentContext = slotContextLabel(attrs);
  if (!currentContext) return tokens;
  return tokens.filter((token) => token.context === currentContext);
}

function selectedReferenceInputValue(attrs: EditorSlotInline, tokens: ReferenceToken[]) {
  if (!attrs.referenceFieldKey) return "";
  if (/^[xy]\d+$/i.test(attrs.referenceFieldKey)) return attrs.referenceFieldKey.toLowerCase();
  const selected = tokens.find((token) => token.fieldKey === attrs.referenceFieldKey);
  return selected?.alias ?? attrs.referenceFieldKey;
}

function normalizeReferenceInput(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function allocateAlias(kind: NumberedSlotKind, attrs: EditorSlotInline, document?: EditorDocument) {
  if (kind === "plain" || kind === "choice") return "i";
  if (!document) return `${kind === "variable" ? "x" : kind === "formula" ? "y" : "z"}1`;
  return nextAvailableSlotAlias(document, kind, slotContextLabel(attrs), attrs.fieldKey);
}

function validateSlotDraft(attrs: EditorSlotInline, tokens: ReferenceToken[], document?: EditorDocument) {
  const aliasError = validateNumberedAlias(attrs, document);
  if (aliasError) return { ok: false as const, error: aliasError };
  if (!isReferenceSlot(attrs)) return { ok: true as const, attrs };
  const referenceTokens = scopedReferenceTokens(attrs, tokens);
  const value = normalizeReferenceInput(attrs.referenceFieldKey);
  if (!value) return { ok: false as const, error: "请输入引用来源编号" };
  const existing = referenceTokens.find((token) => token.fieldKey === value);
  if (existing) return { ok: true as const, attrs: { ...attrs, referenceFieldKey: existing.fieldKey } };
  if (!/^[xy]\d+$/i.test(value)) return { ok: false as const, error: "引用来源已失效，请重新填写本检测项目内的 x/y 编号" };
  const selected = referenceTokens.find((token) => token.alias.toLowerCase() === value);
  if (!selected) return { ok: false as const, error: `本检测项目内不存在引用来源编号：${value}` };
  return { ok: true as const, attrs: { ...attrs, referenceFieldKey: selected.fieldKey } };
}

function replaceFormulaLabels(formulaText: string, tokens: FormulaDisplayToken[]) {
  const mappings = new Map<string, string>();
  tokens.forEach((token) => {
    token.labels.forEach((label) => {
      if (label && label !== token.alias) mappings.set(label, token.alias);
    });
  });
  return [...mappings.entries()]
    .sort(([left], [right]) => right.length - left.length)
    .reduce((text, [label, alias]) => text.replace(new RegExp(escapeRegExp(label), "g"), alias), formulaText);
}

function createFormulaAliasMap(tokens: FormulaDisplayToken[]) {
  const formulas = new Map<string, string>();
  tokens.forEach((token) => {
    if (token.formulaText && /^y\d+$/i.test(token.alias)) {
      formulas.set(token.alias.toLowerCase(), replaceFormulaLabels(token.formulaText, tokens));
    }
  });
  return formulas;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitOptions(value: string) {
  return value.split(/[\n,，]/).map((item) => item.trim()).filter(Boolean);
}

function slotKindOptions() { return [{ value: "plain", label: "普通" }, { value: "variable", label: "输入" }, { value: "formula", label: "输出" }, { value: "reference", label: "引用" }]; }

function inputMethodOptions() { return [{ value: "text", label: "文本" }, { value: "date", label: "日期" }, { value: "datetime", label: "日期+时间" }, { value: "radio", label: "单选" }]; }

function slotKindShortName(attrs: EditorSlotInline) {
  if (effectiveSlotKind(attrs) === "reference") return "z";
  if (attrs.slotKind === "variable") return "x";
  if (attrs.slotKind === "formula" || attrs.type === "formulaSlot") return "y";
  return "i";
}

function slotTypeLabel(attrs: EditorSlotInline, type: EditorSlotType) {
  if (type === "signatureSlot") return "系统签名";
  const kind = effectiveSlotKind(attrs);
  return slotKindOptions().find((option) => option.value === kind)?.label ?? "输入";
}

function slotToneClass(attrs: EditorSlotInline) {
  if (effectiveSlotKind(attrs) === "reference") return "border-rose-200 bg-rose-50 text-rose-700";
  if (attrs.slotKind === "formula" || attrs.type === "formulaSlot") return "border-violet-200 bg-violet-50 text-violet-700";
  if (attrs.slotKind === "variable") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (inputMethod(attrs) === "radio") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-cyan-200 bg-cyan-50 text-cyan-700";
}

function fallbackReferenceAlias(part: EditorSlotInline) {
  if (effectiveSlotKind(part) === "reference") return "z";
  if (part.slotKind === "variable") return "x";
  if (part.slotKind === "formula" || part.type === "formulaSlot") return "y";
  return "z";
}

function effectiveSlotKind(attrs: EditorSlotInline) {
  if (isReferenceSlot(attrs)) return "reference";
  const kind = attrs.slotKind ?? inferredSlotKind(attrs);
  if (kind === "choice" || kind === "date") return "plain";
  return kind;
}

function ruleSectionTitle(attrs: EditorSlotInline, type: EditorSlotType) {
  if (isReferenceSlot(attrs)) return "引用规则";
  if (isFormulaSlot(attrs, type)) return "输出规则";
  return "选项规则";
}

function slotKindPatch(value: string, attrs: EditorSlotInline, alias?: string): SlotPatch {
  const reset: SlotPatch = {
    formulaText: null,
    formula: null,
    referenceFieldKey: null,
    placeholder: null,
  };
  if (value === "plain") return { ...reset, ...inputMethodPatch(inputMethod(attrs), attrs), slotKind: "plain", placeholder: attrs.placeholder, alias };
  if (value === "variable") return { ...reset, ...inputMethodPatch(inputMethod(attrs), attrs), slotKind: "variable", placeholder: attrs.placeholder, alias };
  if (value === "formula") return { ...reset, inputType: null, options: null, slotKind: "formula", alias };
  if (value === "reference") return { ...reset, inputType: null, options: null, slotKind: "reference", alias };
  return { ...reset, slotKind: value as EditorSlotInline["slotKind"] };
}

function inputMethod(attrs: EditorSlotInline) { return attrs.withTime ? "datetime" : attrs.inputType === "date" || attrs.slotKind === "date" || attrs.type === "dateSlot" ? "date" : isOptionSlot(attrs) ? "radio" : "text"; }

function inputMethodPatch(value: string, attrs: EditorSlotInline): SlotPatch {
  if (value === "date") return { inputType: "date", withTime: null, options: null, placeholder: attrs.placeholder };
  if (value === "datetime") return { inputType: "date", withTime: true, options: null, placeholder: attrs.placeholder };
  if (value === "radio") return { inputType: "radio", options: attrs.options?.length ? attrs.options : ["是", "否"], placeholder: null };
  return { inputType: "text", withTime: null, options: null, placeholder: attrs.placeholder };
}

function mergeSlotAttrs(attrs: EditorSlotInline, patch: SlotPatch): EditorSlotInline {
  const next: Record<string, unknown> = { ...attrs };
  Object.entries(patch).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      delete next[key];
    } else {
      next[key] = value;
    }
  });
  return next as unknown as EditorSlotInline;
}

function cloneSlotAttrs(attrs: EditorSlotInline, type: EditorSlotType): EditorSlotInline {
  const next = { ...attrs, type };
  const kind = effectiveSlotKind(next);
  return kind === "plain" ? { ...next, alias: "i" } : next;
}

function nodeAttributes(attrs: EditorSlotInline) {
  const { type: _type, ...rest } = attrs;
  return rest;
}

function widthNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return "";
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : "";
}

function remWidth(value: unknown) {
  const numeric = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(numeric) ? `${numeric}rem` : null;
}

function inferredSlotKind(attrs: EditorSlotInline) {
  if (attrs.type === "signatureSlot") return "person";
  if (attrs.referenceFieldKey) return "reference";
  if (attrs.type === "formulaSlot") return "formula";
  return "plain";
}

function isOptionSlot(attrs: EditorSlotInline) { return attrs.inputType === "radio" || attrs.inputType === "checkbox" || attrs.inputType === "select"; }

function supportsPlaceholder(attrs: EditorSlotInline) {
  return (attrs.slotKind === "plain" || attrs.slotKind === "variable" || (!attrs.slotKind && attrs.type === "fieldSlot")) && inputMethod(attrs) === "text";
}

function supportsAlias(attrs: EditorSlotInline, type: EditorSlotType) {
  return effectiveSlotKind(attrs) === "plain" || effectiveSlotKind(attrs) === "variable" || effectiveSlotKind(attrs) === "formula" || effectiveSlotKind(attrs) === "reference" || type === "formulaSlot";
}

function supportsInputMethod(attrs: EditorSlotInline, type: EditorSlotType) { const kind = effectiveSlotKind(attrs); return type !== "signatureSlot" && (kind === "plain" || kind === "variable"); }

function isFormulaSlot(attrs: EditorSlotInline, type: EditorSlotType) { return !isReferenceSlot(attrs) && (attrs.slotKind === "formula" || (!attrs.slotKind && type === "formulaSlot")); }

function isReferenceSlot(attrs: EditorSlotInline) { return attrs.slotKind === "reference" || !!attrs.referenceFieldKey; }
