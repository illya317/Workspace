"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import type { EditorSlotType } from "./types";

const slotLabels: Record<EditorSlotType, string> = {
  fieldSlot: "字段",
  formulaSlot: "公式",
  dateSlot: "日期",
  signatureSlot: "签名",
};

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
        unit: { default: null },
        width: { default: 96 },
        align: { default: "left" },
        display: { default: "underline" },
        formula: { default: null },
        formulaText: { default: null },
        formulaKind: { default: null },
        readonlyDisplay: { default: false },
        referenceFieldKey: { default: null },
        withTime: { default: false },
        role: { default: null },
        inputType: { default: null },
        options: { default: null },
        placeholder: { default: null },
        metadata: { default: null },
      };
    },

    parseHTML() {
      return [{ tag: `span[data-editor-slot="${name}"]` }];
    },

    renderHTML({ HTMLAttributes }) {
      const label = HTMLAttributes.label || HTMLAttributes.fieldKey || slotLabels[name];
      return [
        "span",
        mergeAttributes(HTMLAttributes, {
          "data-editor-slot": name,
          class: "inline-flex min-h-5 items-end border-b border-slate-500 px-1 text-slate-700",
          style: `min-width:${HTMLAttributes.width || 96}px;text-align:${HTMLAttributes.align || "left"}`,
        }),
        `${label}${HTMLAttributes.unit ? ` ${HTMLAttributes.unit}` : ""}`,
      ];
    },

    renderText({ node }) {
      const label = node.attrs.label || node.attrs.fieldKey || slotLabels[name];
      return `{{${label}}}`;
    },
  });
}

export const FieldSlot = createSlotExtension("fieldSlot");
export const FormulaSlot = createSlotExtension("formulaSlot");
export const DateSlot = createSlotExtension("dateSlot");
export const SignatureSlot = createSlotExtension("signatureSlot");
export const DocumentEditorSlotExtensions = [FieldSlot, FormulaSlot, DateSlot, SignatureSlot];
