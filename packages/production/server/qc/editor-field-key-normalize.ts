import { pinyin } from "pinyin-pro";
import type { EditorBlock, EditorFieldModel } from "./editor-adapter-types";

const keyValueNames = new Set([
  "fieldKey",
  "field_key",
  "referenceFieldKey",
  "reference_field_key",
  "startKey",
  "start_key",
  "startDateKey",
  "start_date_key",
  "fromKey",
  "from_key",
  "endKey",
  "end_key",
  "endDateKey",
  "end_date_key",
  "toKey",
  "to_key",
  "startHourKey",
  "start_hour_key",
  "endHourKey",
  "end_hour_key",
  "inspectionDateKey",
  "inspection_date_key",
  "completionDateKey",
  "completion_date_key",
  "judgmentDateKey",
  "judgment_date_key",
  "packagingKey",
  "packaging_key",
  "sampleQuantityKey",
  "sample_quantity_key",
  "advancedFormulaValueFieldKey",
  "advanced_formula_value_field_key",
  "advancedDependencyValueFieldKey",
  "advanced_dependency_value_field_key",
]);

const keyArrayNames = new Set([
  "dependencyFieldKeys",
  "advancedDependencyFieldKeys",
  "advanced_dependency_field_keys",
]);

const keyArrayMapNames = new Set([
  "dependencyFieldKeyMap",
  "advancedDependencyFieldKeyMap",
  "advanced_dependency_field_key_map",
]);

export function normalizeEditorFieldKeys(blocks: EditorBlock[], fieldModel: EditorFieldModel) {
  const keyMap = buildFieldKeyMap(blocks, fieldModel);
  if (!keyMap.size) return;
  rewriteValue(blocks, keyMap);
  rewriteValue(fieldModel, keyMap);
}

function buildFieldKeyMap(blocks: EditorBlock[], fieldModel: EditorFieldModel) {
  const keys = collectFieldKeys(blocks, fieldModel);
  const existing = new Set(keys);
  const assigned = new Map<string, string>();
  for (const key of [...keys].filter(hasHan).sort()) {
    const normalized = uniqueKey(normalizeFieldKey(key), key, existing);
    existing.add(normalized);
    assigned.set(key, normalized);
  }
  return assigned;
}

function collectFieldKeys(blocks: EditorBlock[], fieldModel: EditorFieldModel) {
  const keys = new Set<string>([
    ...Object.keys(fieldModel.fields),
    ...Object.keys(fieldModel.formulas),
  ]);
  collectFromValue(blocks, keys);
  collectFromValue(fieldModel, keys);
  return keys;
}

function collectFromValue(value: unknown, keys: Set<string>) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectFromValue(item, keys));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (keyValueNames.has(key) && typeof item === "string") keys.add(item);
    if (keyArrayNames.has(key) && Array.isArray(item)) item.forEach((entry) => { if (typeof entry === "string") keys.add(entry); });
    if (keyArrayMapNames.has(key) && isRecord(item)) {
      Object.values(item).flat().forEach((entry) => { if (typeof entry === "string") keys.add(entry); });
    }
    collectFromValue(item, keys);
  }
}

function rewriteValue(value: unknown, keyMap: Map<string, string>): unknown {
  if (Array.isArray(value)) return value.map((item) => rewriteValue(item, keyMap));
  if (!isRecord(value)) return value;
  for (const [key, item] of Object.entries(value)) {
    const nextKey = keyMap.get(key) ?? key;
    if (nextKey !== key) {
      delete value[key];
      value[nextKey] = item;
    }
    value[nextKey] = rewriteObjectValue(nextKey, value[nextKey], keyMap);
  }
  return value;
}

function rewriteObjectValue(key: string, value: unknown, keyMap: Map<string, string>) {
  if (keyValueNames.has(key) && typeof value === "string") return keyMap.get(value) ?? value;
  if (keyArrayNames.has(key) && Array.isArray(value)) {
    return value.map((item) => typeof item === "string" ? keyMap.get(item) ?? item : rewriteValue(item, keyMap));
  }
  if (keyArrayMapNames.has(key) && isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      Array.isArray(entryValue) ? entryValue.map((item) => typeof item === "string" ? keyMap.get(item) ?? item : item) : entryValue,
    ]));
  }
  return rewriteValue(value, keyMap);
}

function normalizeFieldKey(fieldKey: string) {
  return fieldKey.split("/").map(normalizeSegment).join("/");
}

function normalizeSegment(segment: string) {
  if (!hasHan(segment)) return segment;
  const converted = pinyin(segment, { toneType: "none", type: "array" }).join("_");
  return converted.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "field";
}

function uniqueKey(candidate: string, original: string, existing: Set<string>) {
  if (candidate === original || !existing.has(candidate)) return candidate;
  const parts = candidate.split("/");
  const base = parts.pop() || "field";
  let suffix = 2;
  let next = "";
  do {
    next = [...parts, `${base}_${suffix}`].join("/");
    suffix += 1;
  } while (existing.has(next));
  return next;
}

function hasHan(value: string) {
  return /[\u4e00-\u9fff]/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
