import {
  buildAudit,
  countEditorDocument,
  countEnhancedQc,
  editorDocumentToEnhancedQc,
} from "./editor-adapter-audit";
import type {
  EditorBlock,
  EditorDocument,
  EditorFieldDefinition,
  EditorFieldModel,
  EditorInlinePart,
  EditorTableCell,
  QcEditorConversionResult,
} from "./editor-adapter-types";
import type { QcTemplateDetail } from "./types";

const MICROBIOLOGY_TEST_KEY = "microbiology_limit";
const MICROBIOLOGY_TEST_NAME = "微生物限度检查";

interface CanonicalMicrobiologySection {
  heading: string;
  sequence?: string;
  lines: string[];
}

interface CanonicalMicrobiologyBuildState {
  detail: QcTemplateDetail;
  stageKey: string;
  stageLabel: string;
  sequence: string;
  fieldModel: EditorFieldModel;
  fieldIndex: number;
  blockIndex: number;
}

export function appendCanonicalMicrobiologySection(
  detail: QcTemplateDetail,
  conversion: QcEditorConversionResult,
  canonicalMdRaw: string,
): QcEditorConversionResult {
  const section = extractMicrobiologySection(canonicalMdRaw);
  if (!section || documentHasMicrobiologySection(conversion.document)) return conversion;

  const finishedStage = detail.stages.find((stage) => stage.key === "finished") || detail.stages.at(-1);
  const stageKey = finishedStage?.key || "finished";
  const stageLabel = finishedStage?.label || "成品";
  const fieldModel: EditorFieldModel = {
    ...conversion.fieldModel,
    fields: { ...conversion.fieldModel.fields },
    formulas: { ...conversion.fieldModel.formulas },
  };
  const state: CanonicalMicrobiologyBuildState = {
    detail,
    stageKey,
    stageLabel,
    sequence: section.sequence || microbiologySequenceFromHeading(section.heading) || "2.x",
    fieldModel,
    fieldIndex: 0,
    blockIndex: 0,
  };
  const blocks = canonicalMicrobiologyBlocks(section, state);
  if (!blocks.length) return conversion;

  const document: EditorDocument = {
    ...conversion.document,
    blocks: [...conversion.document.blocks, ...blocks],
    metadata: {
      ...conversion.document.metadata,
      canonicalMdSupplements: unique([
        ...arrayOfStrings(conversion.document.metadata.canonicalMdSupplements),
        MICROBIOLOGY_TEST_KEY,
      ]),
    },
  };
  const enhanced = editorDocumentToEnhancedQc(document, fieldModel);
  const editorCounts = countEditorDocument(document, fieldModel);
  const enhancedCounts = countEnhancedQc(enhanced);
  const audit = buildAudit(conversion.audit.counts.legacy, editorCounts, enhancedCounts);
  audit.warnings = unique([...conversion.audit.warnings, ...audit.warnings]);
  return { document, fieldModel, audit };
}

export function microbiologySectionAudit(raw: string) {
  const section = extractMicrobiologySection(raw);
  if (!section) return { found: false };
  const content = section.lines.join("\n");
  return {
    found: true,
    heading: section.heading,
    sequence: section.sequence,
    lineCount: section.lines.filter((line) => line.trim()).length,
    fieldMarkerCount: (content.match(/\{FIELD:/g) || []).length,
    prefillMarkerCount: (content.match(/\{PREFILL:/g) || []).length,
  };
}

function canonicalMicrobiologyBlocks(section: CanonicalMicrobiologySection, state: CanonicalMicrobiologyBuildState): EditorBlock[] {
  const blocks: EditorBlock[] = [
    headingBlock(
      state,
      3,
      section.heading,
      "testHeading",
      { sequence: state.sequence },
    ),
  ];
  let tableRows: string[][] = [];
  for (const rawLine of section.lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const headingMatch = line.match(/^(#{3,6})\s+(.+)$/);
    if (headingMatch) {
      flushTableRows(blocks, tableRows, state);
      tableRows = [];
      blocks.push(headingBlock(
        state,
        4,
        cleanMarkdownText(headingMatch[2]),
        "microbiologySubHeading",
        { sequence: microbiologySequenceFromHeading(headingMatch[2]) },
      ));
      continue;
    }

    if (looksLikeTableRow(line)) {
      const cells = splitMarkdownTableRow(line);
      if (!isMarkdownSeparatorRow(cells)) tableRows.push(cells);
      continue;
    }

    flushTableRows(blocks, tableRows, state);
    tableRows = [];
    blocks.push(paragraphBlock(state, parseMarkdownInlineParts(line, state), "microbiologyParagraph"));
  }
  flushTableRows(blocks, tableRows, state);
  return blocks;
}

function flushTableRows(blocks: EditorBlock[], rows: string[][], state: CanonicalMicrobiologyBuildState) {
  if (rows.length) blocks.push(tableBlock(state, rows));
}

function headingBlock(
  state: CanonicalMicrobiologyBuildState,
  level: 3 | 4,
  text: string,
  qcRole: string,
  extraMetadata: Record<string, unknown> = {},
): EditorBlock {
  return {
    id: canonicalBlockId(state, `${qcRole}:${text}`),
    type: "heading",
    level,
    text: cleanMarkdownText(text),
    bold: true,
    metadata: canonicalBlockMetadata(state, qcRole, extraMetadata),
  };
}

function paragraphBlock(state: CanonicalMicrobiologyBuildState, parts: EditorInlinePart[], qcRole: string): EditorBlock {
  return {
    id: canonicalBlockId(state, qcRole),
    type: "paragraph",
    parts,
    metadata: canonicalBlockMetadata(state, qcRole),
  };
}

function tableBlock(state: CanonicalMicrobiologyBuildState, rows: string[][]): EditorBlock {
  const maxColumns = Math.max(...rows.map((row) => row.length));
  return {
    id: canonicalBlockId(state, "microbiologyTable"),
    type: "table",
    rows: rows.map((row, rowIndex) => ({
      cells: normalizeTableRow(row, maxColumns).map((cellText) => tableCell(cellText, state, rowIndex === 0)),
    })),
    metadata: canonicalBlockMetadata(state, "microbiologyTable"),
  };
}

function tableCell(cellText: string, state: CanonicalMicrobiologyBuildState, header: boolean): EditorTableCell {
  const parts = parseMarkdownInlineParts(cellText, state);
  return {
    rawText: cleanMarkdownText(cellText),
    parts,
    colspan: 1,
    rowspan: 1,
    isEmpty: !cellText.trim(),
    header,
  };
}

function parseMarkdownInlineParts(value: string, state: CanonicalMicrobiologyBuildState): EditorInlinePart[] {
  const parts: EditorInlinePart[] = [];
  const markerPattern = /\{(FIELD|PREFILL):([^{}]+)\}/g;
  let cursor = 0;
  for (const match of value.matchAll(markerPattern)) {
    const before = value.slice(cursor, match.index);
    pushTextPart(parts, before);
    if (match[1] === "PREFILL") {
      pushTextPart(parts, prefillText(match[2]));
    } else {
      parts.push(fieldPart(match[2], state, match[0]));
    }
    cursor = (match.index || 0) + match[0].length;
  }
  pushTextPart(parts, value.slice(cursor));
  return parts.length ? parts : [{ type: "text", text: "" }];
}

function pushTextPart(parts: EditorInlinePart[], value: string) {
  const text = cleanMarkdownText(value);
  if (text) parts.push({ type: "text", text });
}

function fieldPart(markerBody: string, state: CanonicalMicrobiologyBuildState, marker: string): EditorInlinePart {
  const [rawType, ...rest] = markerBody.split(":");
  const inputType = normalizeInputType(rawType);
  const payload = rest.join(":").trim();
  const options = choiceOptions(inputType, payload);
  const label = options.length ? undefined : payload || undefined;
  const fieldKey = nextCanonicalFieldKey(state);
  const fieldDefinition: EditorFieldDefinition = {
    fieldKey,
    name: label || `${MICROBIOLOGY_TEST_NAME} ${state.fieldIndex}`,
    group: MICROBIOLOGY_TEST_NAME,
    valueType: inputType,
    inputType,
    options: options.length ? options : undefined,
    slotKind: options.length ? "choice" : "plain",
    source: canonicalSourceMetadata(state),
    metadata: {
      source: "canonical-md-microbiology",
      marker,
    },
  };
  state.fieldModel.fields[fieldKey] = fieldDefinition;
  if (inputType === "date") {
    return {
      type: "dateSlot",
      fieldKey,
      metadata: { source: "canonical-md-microbiology", marker },
    };
  }
  return {
    type: "fieldSlot",
    fieldKey,
    label,
    inputType,
    options: options.length ? options : undefined,
    placeholder: label,
    slotKind: options.length ? "choice" : "plain",
    width: slotWidth(inputType, label),
    metadata: { source: "canonical-md-microbiology", marker },
  };
}

function nextCanonicalFieldKey(state: CanonicalMicrobiologyBuildState) {
  let fieldKey = "";
  do {
    state.fieldIndex += 1;
    fieldKey = `qc/${state.detail.id}/${state.stageKey}/${MICROBIOLOGY_TEST_KEY}/field_${String(state.fieldIndex).padStart(3, "0")}`;
  } while (state.fieldModel.fields[fieldKey] || state.fieldModel.formulas[fieldKey]);
  return fieldKey;
}

function prefillText(markerBody: string) {
  const [, ...rest] = markerBody.split(":");
  return rest.join(":") || markerBody;
}

function normalizeInputType(value: string) {
  const type = value.trim().toLowerCase();
  if (type === "number" || type === "date" || type === "checkbox" || type === "radio" || type === "select") return type;
  return "text";
}

function choiceOptions(inputType: string, payload: string) {
  if (inputType !== "checkbox" && inputType !== "radio" && inputType !== "select") return [];
  return payload.split(/[\/、,，]/).map((item) => item.trim()).filter(Boolean);
}

function slotWidth(inputType: string, label?: string) {
  if (inputType === "number") return "4.5rem";
  if (label && label.length > 8) return "7rem";
  return "3rem";
}

function canonicalBlockMetadata(
  state: CanonicalMicrobiologyBuildState,
  qcRole: string,
  extraMetadata: Record<string, unknown> = {},
) {
  return {
    qcRole,
    productKey: state.detail.id,
    productName: state.detail.productName,
    stageKey: state.stageKey,
    stageLabel: state.stageLabel,
    testKey: MICROBIOLOGY_TEST_KEY,
    testName: MICROBIOLOGY_TEST_NAME,
    sequence: state.sequence,
    source: canonicalSourceMetadata(state),
    ...extraMetadata,
  };
}

function canonicalSourceMetadata(state: CanonicalMicrobiologyBuildState) {
  return {
    source: "canonical-md",
    productKey: state.detail.id,
    productName: state.detail.productName,
    stageKey: state.stageKey,
    stageLabel: state.stageLabel,
    testKey: MICROBIOLOGY_TEST_KEY,
    testName: MICROBIOLOGY_TEST_NAME,
    sequence: state.sequence,
  };
}

function canonicalBlockId(state: CanonicalMicrobiologyBuildState, suffix: string) {
  state.blockIndex += 1;
  return makeId(["qc", state.detail.id, state.stageKey, MICROBIOLOGY_TEST_KEY, state.blockIndex, suffix].join(":"));
}

function normalizeTableRow(row: string[], maxColumns: number) {
  if (row.length >= maxColumns) return row;
  return [...row, ...Array.from({ length: maxColumns - row.length }, () => "")];
}

function looksLikeTableRow(line: string) {
  return line.includes("|") && !/^#{1,6}\s+/.test(line);
}

function splitMarkdownTableRow(line: string) {
  let value = line.trim();
  if (value.startsWith("|")) value = value.slice(1);
  if (value.endsWith("|")) value = value.slice(0, -1);
  return value.split("|").map((cell) => cleanMarkdownText(cell.trim()));
}

function isMarkdownSeparatorRow(cells: string[]) {
  return cells.length > 0 && cells.every((cell) => !cell || /^:?-{2,}:?$/.test(cell));
}

function documentHasMicrobiologySection(document: EditorDocument) {
  return document.blocks.some((block) => (
    block.type === "heading"
    && block.metadata?.qcRole === "testHeading"
    && (
      block.metadata.testKey === MICROBIOLOGY_TEST_KEY
      || normalizeText(block.text).includes(normalizeText(MICROBIOLOGY_TEST_NAME))
    )
  ));
}

function extractMicrobiologySection(raw: string): CanonicalMicrobiologySection | undefined {
  const lines = raw.split(/\r?\n/);
  const start = lines.findIndex((line) => /^###\s+.+微生物限度检查/.test(line.trim()));
  if (start < 0) return undefined;
  const endOffset = lines.slice(start + 1).findIndex((line) => /^###\s+/.test(line.trim()));
  const end = endOffset < 0 ? lines.length : start + 1 + endOffset;
  const heading = cleanMarkdownText(lines[start].replace(/^###\s+/, ""));
  return {
    heading,
    sequence: microbiologySequenceFromHeading(heading),
    lines: lines.slice(start + 1, end),
  };
}

function microbiologySequenceFromHeading(value: string) {
  return value.match(/^(\d+(?:\.\d+)*)/)?.[1];
}

function cleanMarkdownText(value: string) {
  return value
    .replace(/\*\*/g, "")
    .replace(/\\\|/g, "|")
    .trim();
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, "").replace(/[|｜（）()：:，,。.\-—_]/g, "").toLowerCase();
}

function makeId(value: string) {
  return value.replace(/\s+/g, "_").replace(/[^\w:/.-]+/g, "_");
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
