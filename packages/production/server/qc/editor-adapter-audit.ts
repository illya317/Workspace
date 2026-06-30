import type { QcLayoutBlock, QcLayoutCell, QcLayoutPart, QcTemplateDetail } from "./types";
import type {
  EditorBlock,
  EditorDocument,
  EditorFieldModel,
  EditorInlinePart,
  EditorTableCell,
  EnhancedQcDocument,
  JsonObject,
  QcEditorConversionAudit,
  QcEditorCountSummary,
} from "./editor-adapter-types";

export function editorDocumentToEnhancedQc(document: EditorDocument, fieldModel: EditorFieldModel): EnhancedQcDocument {
  const layoutBlocks = document.blocks.flatMap(editorBlockToQcLayoutBlock);
  const enhanced: EnhancedQcDocument = {
    schemaVersion: 1,
    kind: "enhanced-qc-document",
    sourceDocumentId: document.id,
    layoutBlocks,
    fieldModel,
    audit: {
      counts: {
        editor: countEditorDocument(document, fieldModel),
        enhanced: emptyCounts(),
      },
    },
    metadata: {
      source: "editor-document",
      documentTitle: document.title,
      documentMetadata: document.metadata,
    },
  };
  enhanced.audit.counts.enhanced = countEnhancedQc(enhanced);
  return enhanced;
}

export function countEditorDocument(document: EditorDocument, fieldModel: EditorFieldModel): QcEditorCountSummary {
  const fieldKeys = new Set(Object.keys(fieldModel.fields));
  const formulaKeys = new Set(Object.keys(fieldModel.formulas));
  let tables = 0;
  for (const block of document.blocks) {
    if (block.type === "table") tables += 1;
    visitEditorParts(block, (part) => {
      if (part.type !== "text") fieldKeys.add(part.fieldKey);
      if (part.type === "formulaSlot") formulaKeys.add(part.fieldKey);
    });
  }
  return {
    stages: uniqueMetadataCount(document.blocks, "stageKey"),
    tests: uniqueMetadataCount(document.blocks, "testKey"),
    tables,
    fields: fieldKeys.size,
    formulas: formulaKeys.size,
    blocks: document.blocks.length,
  };
}

export function countLegacyDetail(detail: QcTemplateDetail, fieldModel: EditorFieldModel): QcEditorCountSummary {
  const fields = new Set(Object.keys(fieldModel.fields));
  const formulas = new Set(Object.keys(fieldModel.formulas));
  let tables = 0;
  let blocks = 0;
  for (const stage of detail.stages) {
    for (const block of [...(stage.precheckLayoutBlocks || []), ...(stage.experimentLayoutBlocks || [])]) {
      blocks += 1;
      if (block.type === "table" && block.rows?.length) tables += 1;
    }
    for (const test of stage.tests) {
      for (const field of test.methodGroups.flatMap((group) => group.fields)) {
        if (field.fieldKey) fields.add(field.fieldKey);
        if (field.fieldKey && (field.formula || field.rule || field.attr === "calculated")) formulas.add(field.fieldKey);
      }
      for (const block of test.layoutBlocks || []) {
        blocks += 1;
        if (block.type === "table" && block.rows?.length) tables += 1;
      }
    }
  }
  return {
    stages: detail.stages.length,
    tests: detail.stages.reduce((sum, stage) => sum + stage.tests.length, 0),
    tables,
    fields: fields.size,
    formulas: formulas.size,
    blocks,
  };
}

export function countEnhancedQc(enhanced: EnhancedQcDocument): QcEditorCountSummary {
  const fields = new Set(Object.keys(enhanced.fieldModel.fields));
  const formulas = new Set(Object.keys(enhanced.fieldModel.formulas));
  let tables = 0;
  for (const block of enhanced.layoutBlocks) {
    if (block.type === "table" && block.rows?.length) tables += 1;
    visitQcParts(block, (part) => {
      const key = part.fieldKey || part.field || part.name;
      if (key) fields.add(key);
      if (key && (part.advancedFormulaText || part.advancedFormulaTextMap || part.advancedDependencyFieldKeys?.length)) formulas.add(key);
    });
  }
  return {
    stages: uniqueSourceCount(enhanced.layoutBlocks, "stageKey"),
    tests: uniqueSourceCount(enhanced.layoutBlocks, "testKey"),
    tables,
    fields: fields.size,
    formulas: formulas.size,
    blocks: enhanced.layoutBlocks.length,
  };
}

export function buildAudit(legacy: QcEditorCountSummary, editor: QcEditorCountSummary, enhanced: QcEditorCountSummary): QcEditorConversionAudit {
  const editorMinusLegacy = {
    tables: editor.tables - legacy.tables,
    fields: editor.fields - legacy.fields,
    formulas: editor.formulas - legacy.formulas,
  };
  const enhancedMinusLegacy = {
    tables: enhanced.tables - legacy.tables,
    fields: enhanced.fields - legacy.fields,
    formulas: enhanced.formulas - legacy.formulas,
  };
  const warnings: string[] = [];
  if (editorMinusLegacy.tables < 0 || enhancedMinusLegacy.tables < 0) warnings.push("table count decreased during QC editor conversion");
  if (editorMinusLegacy.fields < 0 || enhancedMinusLegacy.fields < 0) warnings.push("field count decreased during QC editor conversion");
  if (editorMinusLegacy.formulas < 0 || enhancedMinusLegacy.formulas < 0) warnings.push("formula count decreased during QC editor conversion");
  return {
    schemaVersion: 1,
    source: "legacy-qc-to-editor",
    counts: { legacy, editor, enhanced },
    countDeltas: { editorMinusLegacy, enhancedMinusLegacy },
    keyCountChecks: {
      tablesNotReduced: editorMinusLegacy.tables >= 0 && enhancedMinusLegacy.tables >= 0,
      fieldsNotReduced: editorMinusLegacy.fields >= 0 && enhancedMinusLegacy.fields >= 0,
      formulasNotReduced: editorMinusLegacy.formulas >= 0 && enhancedMinusLegacy.formulas >= 0,
    },
    warnings,
  };
}

function editorBlockToQcLayoutBlock(block: EditorBlock): QcLayoutBlock[] {
  const legacyBlock = asRecord(block.metadata?.legacyBlock) as Partial<QcLayoutBlock>;
  if (block.type === "heading") {
    return [{ ...legacyBlock, type: "title", title: block.text, text: block.text }];
  }
  if (block.type === "paragraph") {
    return [{ ...legacyBlock, type: "paragraph", parts: block.parts.map(editorPartToQcPart), text: editorPartsText(block.parts) }];
  }
  if (block.type === "attachment") {
    return [{ ...legacyBlock, type: "attachment_upload", title: block.title, text: block.text, fieldKey: block.fieldKey }];
  }
  return [{
    ...legacyBlock,
    type: "table",
    label: block.label || legacyBlock.label,
    title: block.title || legacyBlock.title,
    columnWidths: block.columnWidths || legacyBlock.columnWidths,
    rows: block.rows.map((row) => row.cells.map(editorCellToQcCell)),
  }];
}

function editorCellToQcCell(cellValue: EditorTableCell): QcLayoutCell {
  const legacyCell = asRecord(cellValue.metadata?.legacyCell) as Partial<QcLayoutCell>;
  return {
    rawText: cellValue.rawText || legacyCell.rawText || "",
    parts: cellValue.parts.map(editorPartToQcPart),
    colspan: cellValue.colspan || legacyCell.colspan || 1,
    rowspan: cellValue.rowspan || legacyCell.rowspan || 1,
    isEmpty: cellValue.isEmpty ?? legacyCell.isEmpty ?? false,
    header: cellValue.header ?? legacyCell.header,
    align: cellValue.align ?? legacyCell.align,
    bold: cellValue.bold ?? legacyCell.bold,
    width: cellValue.width ?? legacyCell.width,
    className: cellValue.className ?? legacyCell.className,
  };
}

function editorPartToQcPart(part: EditorInlinePart): QcLayoutPart {
  const legacyPart = asRecord(part.metadata?.legacyPart) as Partial<QcLayoutPart>;
  if (part.type === "text") return { ...legacyPart, type: legacyPart.type || "text", text: part.text };
  if (part.type === "dateSlot") {
    return { ...legacyPart, type: "date", fieldKey: part.fieldKey, withTime: part.withTime, defaultValue: part.defaultValue, defaultOffsetDays: part.defaultOffsetDays, readonlyDisplay: part.readonlyDisplay };
  }
  if (part.type === "signatureSlot") {
    return { ...legacyPart, type: legacyPart.type || "line", fieldKey: part.fieldKey, readonlyDisplay: part.readonlyDisplay, referenceFieldKey: part.referenceFieldKey, valueSource: part.valueSource, width: part.width };
  }
  if (part.type === "formulaSlot") {
    return {
      ...legacyPart,
      type: legacyPart.type || "line",
      fieldKey: part.fieldKey,
      readonlyDisplay: part.readonlyDisplay ?? true,
      referenceFieldKey: part.referenceFieldKey,
      valueSource: part.valueSource,
      advancedFormulaText: part.formulaText,
      advancedFormulaTextMap: part.formulaTextMap,
      advancedDependencyFieldKeys: part.dependencyFieldKeys,
      advancedDependencyFieldKeyMap: part.dependencyFieldKeyMap,
      width: part.width,
    };
  }
  return {
    ...legacyPart,
    type: part.inputType === "radio" || part.inputType === "checkbox" || part.inputType === "select" ? part.inputType : legacyPart.type || "line",
    fieldKey: part.fieldKey,
    field: part.label || legacyPart.field,
    inputType: part.inputType,
    options: part.options,
    defaultValue: part.defaultValue,
    placeholder: part.placeholder,
    readonlyDisplay: part.readonlyDisplay,
    width: part.width,
  };
}

function visitEditorParts(block: EditorBlock, visit: (part: EditorInlinePart) => void) {
  if (block.type === "paragraph") block.parts.forEach(visit);
  if (block.type === "table") block.rows.forEach((row) => row.cells.forEach((cellValue) => cellValue.parts.forEach(visit)));
}

function visitQcParts(block: QcLayoutBlock, visit: (part: QcLayoutPart) => void) {
  block.parts?.forEach(visit);
  block.rows?.forEach((row) => row.forEach((cellValue) => cellValue.parts.forEach(visit)));
}

function uniqueMetadataCount(blocks: EditorBlock[], key: string) {
  const values = new Set<string>();
  for (const block of blocks) {
    const value = block.metadata?.[key];
    if (typeof value === "string" && value) values.add(value);
  }
  return values.size;
}

function uniqueSourceCount(blocks: QcLayoutBlock[], key: string) {
  const values = new Set<string>();
  for (const block of blocks) {
    const source = asRecord((block as QcLayoutBlock & { source?: unknown }).source);
    const value = source[key];
    if (typeof value === "string" && value) values.add(value);
  }
  return values.size;
}

function editorPartsText(parts: EditorInlinePart[]) {
  return parts.map((part) => part.type === "text" ? part.text : "").join("");
}

function emptyCounts(): QcEditorCountSummary {
  return { stages: 0, tests: 0, tables: 0, fields: 0, formulas: 0, blocks: 0 };
}

function asRecord(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}
