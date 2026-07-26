import type { QcTemplateDetail } from "./types";
import type {
  EditorBlock,
  EditorDocument,
  EditorFieldModel,
  EditorInlinePart,
  QcEditorCountSummary,
  QcEditorImportAudit,
} from "./editor-adapter-types";

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

export function countQcTemplateDetail(detail: QcTemplateDetail, fieldModel: EditorFieldModel): QcEditorCountSummary {
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

export function buildImportAudit(source: QcEditorCountSummary, editor: QcEditorCountSummary): QcEditorImportAudit {
  const editorMinusSource = {
    tables: editor.tables - source.tables,
    fields: editor.fields - source.fields,
    formulas: editor.formulas - source.formulas,
  };
  const warnings: string[] = [];
  if (editorMinusSource.tables < 0) warnings.push("table count decreased during QC template import");
  if (editorMinusSource.fields < 0) warnings.push("field count decreased during QC template import");
  if (editorMinusSource.formulas < 0) warnings.push("formula count decreased during QC template import");
  return {
    schemaVersion: 1,
    source: "qc-template-import",
    counts: { source, editor },
    countDeltas: { editorMinusSource },
    keyCountChecks: {
      tablesNotReduced: editorMinusSource.tables >= 0,
      fieldsNotReduced: editorMinusSource.fields >= 0,
      formulasNotReduced: editorMinusSource.formulas >= 0,
    },
    warnings,
  };
}

function visitEditorParts(block: EditorBlock, visit: (part: EditorInlinePart) => void) {
  if (block.type === "paragraph") block.parts.forEach(visit);
  if (block.type === "table") block.rows.forEach((row) => row.cells.forEach((cellValue) => cellValue.parts.forEach(visit)));
}

function uniqueMetadataCount(blocks: EditorBlock[], key: string) {
  const values = new Set<string>();
  for (const block of blocks) {
    const value = block.metadata?.[key];
    if (typeof value === "string" && value) values.add(value);
  }
  return values.size;
}
