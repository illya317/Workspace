type JsonRecord = Record<string, unknown>;

export function upgradeGeneratedQcUserContent(input: {
  productKey: string;
  document: unknown;
  fieldModel: unknown;
  sourceFieldModel: unknown;
}) {
  const percentFieldKeys = markedPercentFieldKeys(input.sourceFieldModel);
  const fieldModelChanged = applyPercentFieldModes(input.fieldModel, percentFieldKeys);
  const alignmentChanged = centerQcSummaryResultCells(input.document);
  const suffixChanged = input.productKey === "pantoprazole" && replacePantoprazoleResultSuffixes(input.document);
  const documentChanged = alignmentChanged || suffixChanged;
  return { changed: fieldModelChanged || documentChanged, document: input.document, fieldModel: input.fieldModel };
}

function centerQcSummaryResultCells(value: unknown): boolean {
  if (Array.isArray(value)) {
    let changed = false;
    value.forEach((item) => { changed = centerQcSummaryResultCells(item) || changed; });
    return changed;
  }
  if (!isRecord(value)) return false;
  let changed = false;
  if (Array.isArray(value.parts) && isQcSummaryResultParts(value.parts) && value.align !== "center") {
    value.align = "center";
    changed = true;
  }
  Object.values(value).forEach((item) => { changed = centerQcSummaryResultCells(item) || changed; });
  return changed;
}

function isQcSummaryResultParts(parts: unknown[]) {
  const records = parts.filter(isRecord);
  const prefix = text(records.find((part) => part.type === "text")?.text);
  return records.some((part) => part.type === "formulaSlot")
    && /^(?:样\s*\d+|CX\d+|AR\d+|[12]、)/.test(prefix);
}

function markedPercentFieldKeys(fieldModel: unknown) {
  const keys = new Set<string>();
  forEachField(fieldModel, (field, fallbackKey) => {
    if (field.formulaInputMode !== "percent") return;
    const fieldKey = text(field.fieldKey) || text(field.key) || fallbackKey;
    if (fieldKey) keys.add(fieldKey);
  });
  return keys;
}

function applyPercentFieldModes(fieldModel: unknown, fieldKeys: Set<string>) {
  let changed = false;
  forEachField(fieldModel, (field, fallbackKey) => {
    const fieldKey = text(field.fieldKey) || text(field.key) || fallbackKey;
    if (!fieldKeys.has(fieldKey) || field.formulaInputMode === "percent") return;
    field.formulaInputMode = "percent";
    changed = true;
  });
  return changed;
}

function forEachField(fieldModel: unknown, visit: (field: JsonRecord, fallbackKey: string) => void) {
  if (!isRecord(fieldModel)) return;
  const fields = fieldModel.fields;
  if (Array.isArray(fields)) {
    fields.forEach((field) => {
      if (isRecord(field)) visit(field, "");
    });
    return;
  }
  if (!isRecord(fields)) return;
  Object.entries(fields).forEach(([key, field]) => {
    if (isRecord(field)) visit(field, key);
  });
}

function replacePantoprazoleResultSuffixes(value: unknown): boolean {
  if (Array.isArray(value)) {
    let changed = replaceResultSuffixInParts(value);
    value.forEach((item) => { changed = replacePantoprazoleResultSuffixes(item) || changed; });
    return changed;
  }
  if (!isRecord(value)) return false;
  let changed = false;
  Object.values(value).forEach((item) => { changed = replacePantoprazoleResultSuffixes(item) || changed; });
  return changed;
}

function replaceResultSuffixInParts(parts: unknown[]) {
  let changed = false;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const slot = parts[index];
    const suffix = parts[index + 1];
    if (!isPantoprazoleContentResult(slot) || !isRecord(suffix) || suffix.type !== "text") continue;
    if (!/^\s*×\s*100%\s*=\s*$/.test(text(suffix.text))) continue;
    suffix.text = "%";
    changed = true;
  }
  return changed;
}

function isPantoprazoleContentResult(value: unknown) {
  if (!isRecord(value) || value.type !== "formulaSlot") return false;
  return /\/pantoprazole_uv\/yang_[12]_han_liang$/.test(text(value.fieldKey));
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
