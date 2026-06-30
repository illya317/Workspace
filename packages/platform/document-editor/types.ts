import type { ReactNode } from "react";

export type EditorSlotType = "fieldSlot" | "formulaSlot" | "dateSlot" | "signatureSlot";
export type EditorInlineType = "text" | EditorSlotType;
export type EditorBlockType = "heading" | "paragraph" | "table" | "attachment" | "pageBreak";

export interface EditorDocument {
  schemaVersion: 1;
  kind: "qc-editor-document" | "editor-document";
  id: string;
  title: string;
  blocks: EditorBlock[];
  metadata?: Record<string, unknown>;
}

export type EditorBlock = EditorHeadingBlock | EditorParagraphBlock | EditorTableBlock | EditorAttachmentBlock | EditorPageBreakBlock;

export interface EditorHeadingBlock {
  id: string;
  type: "heading";
  level: 1 | 2 | 3 | 4;
  text: string;
  bold?: boolean;
  metadata?: Record<string, unknown>;
}

export interface EditorParagraphBlock {
  id: string;
  type: "paragraph";
  parts: EditorInline[];
  metadata?: Record<string, unknown>;
}

export interface EditorTableBlock {
  id: string;
  type: "table";
  title?: string;
  label?: string;
  rows: EditorTableRow[];
  columnWidths?: string[];
  metadata?: Record<string, unknown>;
}

export interface EditorAttachmentBlock {
  id: string;
  type: "attachment";
  title: string;
  text: string;
  fieldKey: string;
  metadata?: Record<string, unknown>;
}

export interface EditorPageBreakBlock {
  id: string;
  type: "pageBreak";
  metadata?: Record<string, unknown>;
}

export interface EditorTableRow {
  id?: string;
  cells: EditorTableCell[];
  height?: string;
}

export interface EditorTableCell {
  id?: string;
  rawText?: string;
  parts: EditorInline[];
  colspan?: number;
  rowspan?: number;
  isEmpty?: boolean;
  header?: boolean;
  align?: string;
  bold?: boolean;
  width?: string | number;
  className?: string;
  metadata?: Record<string, unknown>;
}

export type EditorInline = EditorTextInline | EditorSlotInline;

export interface EditorTextInline {
  type: "text";
  text: string;
  bold?: boolean;
  marks?: EditorTextMarks;
  metadata?: Record<string, unknown>;
}

export interface EditorTextMarks {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface EditorSlotInline {
  type: EditorSlotType;
  fieldKey: string;
  id?: string;
  label?: string;
  alias?: string;
  slotKind?: "person" | "date" | "choice" | "plain" | "variable" | "formula" | "reference";
  unit?: string;
  width?: string | number;
  align?: "left" | "center" | "right" | string;
  display?: "underline" | "box" | "plain";
  formula?: string;
  formulaText?: string;
  formulaTextMap?: Record<string, string>;
  dependencyFieldKeys?: string[];
  dependencyFieldKeyMap?: Record<string, string[]>;
  readonlyDisplay?: boolean;
  referenceFieldKey?: string;
  valueSource?: Record<string, unknown>;
  withTime?: boolean;
  defaultValue?: string;
  defaultOffsetDays?: number;
  role?: "inspector" | "reviewer" | "signature";
  inputType?: string;
  options?: string[];
  placeholder?: string;
  metadata?: Record<string, unknown>;
}

export interface FieldModel {
  schemaVersion?: 1;
  fields: Record<string, FieldDefinition> | FieldDefinition[];
  formulas?: Record<string, FormulaDefinition>;
  formulaTemplates?: FormulaTemplateDefinition[];
}

export interface FormulaTemplateDefinition {
  key: string;
  name: string;
  kind?: "function" | "template";
  parameters: string[];
  formula: string;
  contexts?: string[];
}

export interface FieldDefinition {
  key?: string;
  fieldKey?: string;
  label?: string;
  name?: string;
  group?: string;
  type?: "number" | "text" | "boolean" | "date" | "signature" | string;
  valueType?: string;
  inputType?: string;
  attr?: string;
  unit?: string;
  precision?: number;
  formula?: string;
  dependencies?: string[];
  options?: string[];
  defaultValue?: string;
  recommendedValue?: string;
  readonlyDisplay?: boolean;
  referenceFieldKey?: string;
  valueSource?: Record<string, unknown>;
  slotKind?: string;
  mode?: "manual" | "formula" | "readonly";
  required?: boolean;
  metadata?: Record<string, unknown>;
}

export interface FormulaDefinition {
  fieldKey: string;
  formulaText?: string;
  rule?: string;
  dependencyFieldKeys?: string[];
  referenceFieldKey?: string;
  readonlyDisplay?: boolean;
  slotKind?: string;
  metadata?: Record<string, unknown>;
}

export interface DocumentEditorCanvasProps {
  document: EditorDocument;
  fieldModel: FieldModel;
  computedValues?: Record<string, unknown>;
  editable?: boolean;
  onChange?: (document: EditorDocument) => void;
}

export interface DocumentPreviewProps {
  document: EditorDocument;
  values?: Record<string, unknown>;
  toolbar?: ReactNode;
}
