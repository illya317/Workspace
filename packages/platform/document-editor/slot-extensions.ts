"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import type { EditorSlotType } from "./types";

const slotLabels: Record<EditorSlotType, string> = {
  fieldSlot: "输入",
  formulaSlot: "输出",
  dateSlot: "日期",
  signatureSlot: "签名",
};

function technicalToken(value: unknown) {
  return typeof value === "string" && (
    value.includes("/")
    || value.includes("_")
    || /^[a-z][a-z0-9.-]*$/i.test(value)
  );
}

function visibleSlotLabel(attrs: Record<string, unknown>) {
  const alias = typeof attrs.alias === "string" ? attrs.alias.trim() : "";
  const label = typeof attrs.label === "string" ? attrs.label.trim() : "";
  const defaultValue = typeof attrs.defaultValue === "string" ? attrs.defaultValue.trim() : "";
  if (defaultValue) return defaultValue;
  if (alias) return alias;
  if (label && !technicalToken(label)) return label;
  const placeholder = typeof attrs.placeholder === "string" ? attrs.placeholder.trim() : "";
  if (placeholder && !technicalToken(placeholder)) return placeholder;
  return "";
}

function slotTitle(attrs: Record<string, unknown>, name: EditorSlotType) {
  const key = typeof attrs.fieldKey === "string" ? attrs.fieldKey : "";
  const label = typeof attrs.label === "string" ? attrs.label : "";
  return [label || slotLabels[name], key].filter(Boolean).join(" · ");
}

function cssSlotWidth(value: unknown) {
  if (value === 0 || value === "0" || value === "0rem") return "auto";
  if (typeof value === "number" && Number.isFinite(value)) return `${value}px`;
  if (typeof value === "string" && value.trim()) return value.trim();
  return "3rem";
}

function choiceOptions(attrs: Record<string, unknown>) {
  if (attrs.inputType !== "radio" && attrs.inputType !== "checkbox") return [];
  return Array.isArray(attrs.options) ? attrs.options.map(String).filter(Boolean) : [];
}

function choiceNodes(options: string[]) {
  return options.map((option) => [
    "span",
    { class: "mr-6 inline-block whitespace-nowrap last:mr-0" },
    `□${option}`,
  ]);
}

function slotClassName(name: EditorSlotType, attrs: Record<string, unknown>) {
  const base = "inline-flex max-w-full items-end justify-center overflow-hidden whitespace-nowrap rounded border-b px-1 ring-1 align-text-bottom";
  if (attrs.slotKind === "reference" || attrs.referenceFieldKey) {
    return `${base} border-rose-400 bg-rose-50 text-rose-800 ring-rose-200`;
  }
  if (attrs.inputType === "date" || attrs.slotKind === "date" || name === "dateSlot") {
    return `${base} border-sky-500 bg-sky-50 text-sky-900 ring-sky-200`;
  }
  if (name === "formulaSlot" || attrs.slotKind === "formula") {
    return `${base} border-violet-500 bg-violet-50 text-violet-900 ring-violet-200`;
  }
  if (attrs.slotKind === "variable") {
    return `${base} border-emerald-500 bg-emerald-50 text-emerald-900 ring-emerald-200`;
  }
  if (attrs.slotKind === "parameter") {
    return `${base} border-orange-500 bg-orange-50 text-orange-900 ring-orange-200`;
  }
  return `${base} border-cyan-500 bg-cyan-50 text-cyan-900 ring-cyan-200`;
}

function annotationDataAttributes(metadata: unknown) {
  if (!metadataAnnotation(metadata)) return {};
  return { "data-docs-annotation": "true" };
}

function annotationClassName(metadata: unknown) {
  return metadataAnnotation(metadata) ? "docs-editor-annotation print:hidden" : "";
}

function metadataAnnotation(value: unknown) {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && (("annotation" in value && value.annotation === true) || ("noPrint" in value && value.noPrint === true)),
  );
}

export function createSlotExtension(name: EditorSlotType) {
  return Node.create({
    name,
    group: "inline",
    inline: true,
    atom: true,

    addAttributes() {
      return {
        id: { default: null },
        fieldKey: { default: null },
        label: { default: null },
        alias: { default: null },
        slotKind: { default: null },
        unit: { default: null },
        width: { default: "3rem" },
        align: { default: "center" },
        display: { default: "underline" },
        formula: { default: null },
        formulaText: { default: null },
        formulaTextMap: { default: null },
        dependencyFieldKeys: { default: null },
        dependencyFieldKeyMap: { default: null },
        readonlyDisplay: { default: false },
        referenceFieldKey: { default: null },
        valueSource: { default: null },
        withTime: { default: false },
        defaultValue: { default: null },
        role: { default: null },
        inputType: { default: null },
        valueType: { default: null },
        numberFormat: { default: null },
        precision: { default: null },
        options: { default: null },
        placeholder: { default: null },
        metadata: { default: null },
      };
    },

    parseHTML() {
      return [{ tag: `span[data-editor-slot="${name}"]` }];
    },

    renderHTML({ HTMLAttributes }) {
      const options = name === "fieldSlot" ? choiceOptions(HTMLAttributes) : [];
      if (options.length) {
        return [
          "span",
          mergeAttributes(HTMLAttributes, {
            "data-editor-slot": name,
            title: slotTitle(HTMLAttributes, name),
            class: `inline-block whitespace-nowrap rounded bg-amber-50 px-1 text-slate-950 ring-1 ring-amber-200 align-baseline ${annotationClassName(HTMLAttributes.metadata)}`,
            ...annotationDataAttributes(HTMLAttributes.metadata),
          }),
          ...choiceNodes(options),
        ];
      }
      const label = visibleSlotLabel(HTMLAttributes);
      const width = cssSlotWidth(HTMLAttributes.width);
      const content = label || "\u00A0";
      const isAutoWidth = width === "auto";
      return [
        "span",
        mergeAttributes(HTMLAttributes, {
          "data-editor-slot": name,
          title: slotTitle(HTMLAttributes, name),
          class: `${slotClassName(name, HTMLAttributes)} ${isAutoWidth ? "border-b-0" : ""} ${annotationClassName(HTMLAttributes.metadata)}`,
          ...annotationDataAttributes(HTMLAttributes.metadata),
          style: `${isAutoWidth ? "width:auto" : `width:min(${width},100%)`};max-width:100%;min-height:1.1em;line-height:1;text-align:${HTMLAttributes.align || "center"}`,
        }),
        content,
      ];
    },

    renderText({ node }) {
      const label = visibleSlotLabel(node.attrs) || slotLabels[name];
      return `{{${label}}}`;
    },
  });
}

export const FieldSlot = createSlotExtension("fieldSlot");
export const FormulaSlot = createSlotExtension("formulaSlot");
export const DateSlot = createSlotExtension("dateSlot");
export const SignatureSlot = createSlotExtension("signatureSlot");
export const DocumentEditorSlotExtensions = [FieldSlot, FormulaSlot, DateSlot, SignatureSlot];
