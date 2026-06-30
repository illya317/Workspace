import type { QcLayoutBlock, QcTemplateDetail, QcTemplateStage, QcTemplateTestItem } from "./types";

export type JsonObject = Record<string, unknown>;

export type EditorInlinePartType = "text" | "fieldSlot" | "formulaSlot" | "dateSlot" | "signatureSlot";
export type EditorBlockType = "heading" | "paragraph" | "table" | "attachment" | "pageBreak";

export interface EditorInlinePartBase {
  type: EditorInlinePartType;
  alias?: string;
  slotKind?: "person" | "date" | "choice" | "plain" | "variable" | "formula" | "reference";
  metadata?: JsonObject;
}

export interface EditorTextPart extends EditorInlinePartBase {
  type: "text";
  text: string;
}

export interface EditorFieldSlotPart extends EditorInlinePartBase {
  type: "fieldSlot";
  fieldKey: string;
  label?: string;
  inputType?: string;
  options?: string[];
  defaultValue?: string;
  placeholder?: string;
  readonlyDisplay?: boolean;
  width?: string;
}

export interface EditorFormulaSlotPart extends EditorInlinePartBase {
  type: "formulaSlot";
  fieldKey: string;
  label?: string;
  formulaText?: string;
  formulaTextMap?: Record<string, string>;
  dependencyFieldKeys?: string[];
  dependencyFieldKeyMap?: Record<string, string[]>;
  readonlyDisplay?: boolean;
  referenceFieldKey?: string;
  valueSource?: JsonObject;
  width?: string;
}

export interface EditorDateSlotPart extends EditorInlinePartBase {
  type: "dateSlot";
  fieldKey: string;
  withTime?: boolean;
  defaultValue?: string;
  defaultOffsetDays?: number;
  readonlyDisplay?: boolean;
}

export interface EditorSignatureSlotPart extends EditorInlinePartBase {
  type: "signatureSlot";
  fieldKey: string;
  role: "inspector" | "reviewer" | "signature";
  readonlyDisplay?: boolean;
  referenceFieldKey?: string;
  valueSource?: JsonObject;
  width?: string;
}

export type EditorInlinePart =
  | EditorTextPart
  | EditorFieldSlotPart
  | EditorFormulaSlotPart
  | EditorDateSlotPart
  | EditorSignatureSlotPart;

export interface EditorTableCell {
  rawText?: string;
  parts: EditorInlinePart[];
  colspan: number;
  rowspan: number;
  isEmpty?: boolean;
  header?: boolean;
  align?: string;
  bold?: boolean;
  width?: string;
  className?: string;
  metadata?: JsonObject;
}

export interface EditorTableRow {
  cells: EditorTableCell[];
  height?: string;
}

export interface EditorBlockBase {
  id: string;
  type: EditorBlockType;
  metadata?: JsonObject;
}

export interface EditorHeadingBlock extends EditorBlockBase {
  type: "heading";
  level: 1 | 2 | 3 | 4;
  text: string;
  bold?: boolean;
}

export interface EditorParagraphBlock extends EditorBlockBase {
  type: "paragraph";
  parts: EditorInlinePart[];
}

export interface EditorTableBlock extends EditorBlockBase {
  type: "table";
  title?: string;
  label?: string;
  rows: EditorTableRow[];
  columnWidths?: string[];
}

export interface EditorAttachmentBlock extends EditorBlockBase {
  type: "attachment";
  title: string;
  text: string;
  fieldKey: string;
}

export interface EditorPageBreakBlock extends EditorBlockBase {
  type: "pageBreak";
}

export type EditorBlock = EditorHeadingBlock | EditorParagraphBlock | EditorTableBlock | EditorAttachmentBlock | EditorPageBreakBlock;

export interface EditorDocument {
  schemaVersion: 1;
  kind: "qc-editor-document";
  id: string;
  title: string;
  blocks: EditorBlock[];
  metadata: JsonObject;
}

export interface EditorFieldDefinition {
  fieldKey: string;
  name?: string;
  group?: string;
  valueType?: string;
  inputType?: string;
  attr?: string;
  unit?: string;
  options?: string[];
  defaultValue?: string;
  recommendedValue?: string;
  readonlyDisplay?: boolean;
  referenceFieldKey?: string;
  valueSource?: JsonObject;
  source?: JsonObject;
  alias?: string;
  slotKind?: string;
  metadata?: JsonObject;
}

export interface EditorFormulaDefinition {
  fieldKey: string;
  formulaText?: string;
  rule?: string;
  dependencyFieldKeys: string[];
  referenceFieldKey?: string;
  readonlyDisplay?: boolean;
  source?: JsonObject;
  alias?: string;
  slotKind?: string;
  metadata?: JsonObject;
}

export interface EditorFieldModel {
  schemaVersion: 1;
  fields: Record<string, EditorFieldDefinition>;
  formulas: Record<string, EditorFormulaDefinition>;
}

export interface QcEditorCountSummary {
  stages: number;
  tests: number;
  tables: number;
  fields: number;
  formulas: number;
  blocks: number;
}

export interface QcEditorConversionAudit {
  schemaVersion: 1;
  source: "legacy-qc-to-editor";
  counts: {
    legacy: QcEditorCountSummary;
    editor: QcEditorCountSummary;
    enhanced: QcEditorCountSummary;
  };
  countDeltas: {
    editorMinusLegacy: Pick<QcEditorCountSummary, "tables" | "fields" | "formulas">;
    enhancedMinusLegacy: Pick<QcEditorCountSummary, "tables" | "fields" | "formulas">;
  };
  keyCountChecks: {
    tablesNotReduced: boolean;
    fieldsNotReduced: boolean;
    formulasNotReduced: boolean;
  };
  warnings: string[];
}

export interface QcEditorConversionResult {
  document: EditorDocument;
  fieldModel: EditorFieldModel;
  audit: QcEditorConversionAudit;
}

export interface EnhancedQcDocument {
  schemaVersion: 1;
  kind: "enhanced-qc-document";
  sourceDocumentId: string;
  layoutBlocks: QcLayoutBlock[];
  fieldModel: EditorFieldModel;
  audit: {
    counts: {
      editor: QcEditorCountSummary;
      enhanced: QcEditorCountSummary;
    };
  };
  metadata: JsonObject;
}

export type LegacyQcInput = QcTemplateDetail | QcLayoutBlock[] | {
  id?: string;
  productName?: string;
  stages?: QcTemplateStage[];
  blocks?: QcLayoutBlock[];
  test?: QcTemplateTestItem;
};
