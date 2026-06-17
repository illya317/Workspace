import "server-only";
import path from "path";
import { readFile } from "fs/promises";
import { mapCustomLayoutBlock } from "./layout-custom-blocks";
import {
  asArray,
  asBoolean,
  asNumber,
  asRange,
  asRecord,
  asString,
  formatText,
  maybeNumber,
  maybePositiveNumber,
  normalizeKey,
  paramString,
  safeFile,
  stringArrayRecord,
  stringRecord,
  substitute,
  widthFromChars,
  type LayoutParams,
} from "./layout-block-utils";
import type { QcLayoutBlock, QcLayoutCell, QcLayoutPart, QcTemplateLayoutAssignment } from "./types";

type Params = LayoutParams;

function mapPart(value: unknown, params: Params = {}): QcLayoutPart {
  const part = asRecord(value);
  const type = asString(part.type, "text");
  const name = asString(part.name);
  const paramValue = type === "param" && name ? asString(params[name]) : "";
  return {
    type,
    text: formatText(asString(part.text), params) || undefined,
    sectionRef: asString(part.section_ref || part.sectionRef) || undefined,
    sectionSuffix: asString(part.section_suffix || part.sectionSuffix) || undefined,
    fieldKey: asString(part.field_key || part.fieldKey || part.key) || undefined,
    field: asString(part.field) || undefined,
    name: name || undefined,
    options: asArray(part.options).map((option) => asString(option)).filter(Boolean),
    width: asString(part.width) || widthFromChars(part.initial_chars || part.initialChars),
    underline: asBoolean(part.underline),
    placeholder: asString(part.placeholder ?? part.hint) || undefined,
    multiline: asBoolean(part.multiline ?? part.multiLine),
    rows: maybePositiveNumber(part.rows ?? part.min_rows ?? part.minRows),
    withTime: asBoolean(part.with_time ?? part.withTime),
    inputType: asString(part.input_type || part.inputType) || undefined,
    defaultValue: paramValue || asString(part.default ?? part.default_value) || undefined,
    defaultOffsetDays: maybeNumber(part.default_offset_days ?? part.defaultOffsetDays),
    readonlyDisplay: asBoolean(part.readonly_display ?? part.readOnlyDisplay),
    occurrence: maybePositiveNumber(part.occurrence ?? part.field_occurrence ?? part.fieldOccurrence),
    startKey: asString(part.start_key || part.start_date_key || part.from_key || part.startKey) || undefined,
    endKey: asString(part.end_key || part.end_date_key || part.to_key || part.endKey) || undefined,
    startHourKey: asString(part.start_hour_key || part.startHourKey) || undefined,
    endHourKey: asString(part.end_hour_key || part.endHourKey) || undefined,
    recommendedRange: asRange(part.recommended_range ?? part.recommendedRange ?? part.expected_range ?? part.expectedRange),
    summaryDay: maybePositiveNumber(part.summary_day ?? part.summaryDay),
    advancedFormulaText: asString(part.advanced_formula_text ?? part.advancedFormulaText) || undefined,
    advancedFormulaTextMap: stringRecord(part.advanced_formula_text_map ?? part.advancedFormulaTextMap),
    advancedFormulaValueFieldKey: asString(part.advanced_formula_value_field_key ?? part.advancedFormulaValueFieldKey) || undefined,
    advancedDependencyFieldKeys: asArray(part.advanced_dependency_field_keys ?? part.advancedDependencyFieldKeys).map((item) => asString(item)).filter(Boolean),
    advancedDependencyFieldKeyMap: stringArrayRecord(part.advanced_dependency_field_key_map ?? part.advancedDependencyFieldKeyMap),
    advancedDependencyValueFieldKey: asString(part.advanced_dependency_value_field_key ?? part.advancedDependencyValueFieldKey) || undefined,
    path: asString(part.path) || undefined,
    stripPlaceholder: asBoolean(part.strip_placeholder ?? part.stripPlaceholder),
    bold: asBoolean(part.bold),
  };
}

function mapCell(value: unknown, params: Params = {}): QcLayoutCell {
  const cell = asRecord(value);
  const textPath = asString(cell.text_path || cell.textPath);
  const text = textPath ? paramString(params, textPath) || "" : formatText(asString(cell.raw_text || cell.rawText || cell.text), params);
  return {
    rawText: text,
    parts: asArray(cell.parts).map((part) => mapPart(part, params)),
    colspan: asNumber(cell.colspan),
    rowspan: asNumber(cell.rowspan),
    isEmpty: cell.is_empty === true || cell.isEmpty === true,
    header: asBoolean(cell.header),
    align: asString(cell.align) || undefined,
    bold: asBoolean(cell.bold),
    width: asString(cell.width) || undefined,
    className: asString(cell.className) || undefined,
  };
}

function applyBlockParams(block: Record<string, unknown>, params: Params) {
  const overrideKeys = [
    "temperature_range", "humidity_limit", "room_rows", "devices", "materials", "standards", "items", "field_prefix",
    "section_suffix", "section_slot", "section_role", "section_ref", "section_anchor", "has_value", "auto_judgment",
    "conclusion_name", "unit", "order", "module_order",
  ];
  const overrides = Object.fromEntries(overrideKeys.flatMap((key) => params[key] !== undefined ? [[key, params[key]]] : []));
  return Object.fromEntries(Object.entries({ ...block, ...overrides }).map(([key, value]) => [key, substitute(value, params)]));
}

function mapBlock(value: unknown, params: Params = {}): QcLayoutBlock | null {
  const raw = applyBlockParams(asRecord(value), params), type = asString(raw.type, "table");
  const custom = mapCustomLayoutBlock(raw, params);
  if (custom) return custom;
  const rows = asArray(raw.rows).map((row) => asArray(asRecord(row).cells).map((cell) => mapCell(cell, params)));
  if (type === "table" && rows.length === 0) return null;
  const textPath = asString(raw.text_path || raw.textPath), resolvedText = textPath ? paramString(params, textPath) || "" : asString(raw.text || raw.fixed_text), resolvedTitle = asString(raw.title) || (type === "title" ? resolvedText : "");
  return {
    type,
    label: asString(raw.label) || undefined,
    title: resolvedTitle || undefined,
    text: resolvedText || undefined,
    sectionSuffix: asString(raw.section_suffix || raw.sectionSuffix || raw.section_no || raw.sectionNo) || undefined,
    sectionSlot: asString(raw.section_slot || raw.sectionSlot) || undefined,
    sectionRole: asString(raw.section_role || raw.sectionRole) || undefined,
    sectionRef: asString(raw.section_ref || raw.sectionRef) || undefined,
    sectionAnchor: asBoolean(raw.section_anchor ?? raw.sectionAnchor),
    fieldPrefix: asString(raw.field_prefix || raw.fieldPrefix) || undefined,
    inspectionDateKey: asString(raw.inspection_date_key || raw.inspectionDateKey) || undefined,
    completionDateKey: asString(raw.completion_date_key || raw.completionDateKey) || undefined,
    judgmentDateKey: asString(raw.judgment_date_key || raw.judgmentDateKey) || undefined,
    packagingKey: asString(raw.packaging_key || raw.packagingKey) || undefined,
    sampleQuantityKey: asString(raw.sample_quantity_key || raw.sampleQuantityKey) || undefined,
    fieldKeyOverrides: asRecord(raw.field_key_overrides || raw.fieldKeyOverrides) as Record<string, string>,
    fileSectionSuffix: asString(raw.file_section_suffix || raw.fileSectionSuffix || raw.file_section_no || raw.fileSectionNo) || undefined, fileTitle: asString(raw.file_title || raw.fileTitle) || undefined,
    rows: rows.length ? rows : undefined,
    parts: asArray(raw.parts).map((part) => mapPart(part, params)),
    devices: asArray(raw.devices).map((device) => {
      const data = asRecord(device);
      return { name: asString(data.name, "仪器、设备"), status: asString(data.status) || undefined };
    }),
    materials: asArray(raw.materials).map((material) => ({ name: asString(asRecord(material).name || material, "试验材料") })),
    standards: asArray(raw.standards).map((standard) => ({ name: asString(asRecord(standard).name || standard, "对照品") })),
    items: asArray(raw.items).map((item) => asString(asRecord(item).text || asRecord(item).name || item)).filter(Boolean),
    temperatureRange: paramString(raw, "temperature_range"),
    humidityLimit: paramString(raw, "humidity_limit"),
    roomRows: asNumber(raw.room_rows || raw.rows, 1),
    hasValue: asBoolean(raw.has_value ?? raw.hasValue),
    autoJudgment: asBoolean(raw.auto_judgment ?? raw.autoJudgment),
    conclusionName: asString(raw.conclusion_name || raw.conclusionName) || undefined,
    unit: asString(raw.unit) || undefined,
    fieldKey: asString(raw.field_key || raw.fieldKey || raw.key) || undefined,
    buttonText: asString(raw.button_text || raw.buttonText) || undefined,
    order: Number(raw.order) || undefined,
    moduleOrder: Number(raw.module_order || raw.moduleOrder) || undefined,
  };
}

async function readJson(filePath: string) {
  const raw = await readFile(filePath, "utf8").catch(() => "");
  return raw ? JSON.parse(raw) as unknown : undefined;
}

function sorted(items: Array<{ order?: unknown; module_order?: unknown; moduleOrder?: unknown; params?: unknown }>) {
  const entryOrder = (item: typeof items[number], key: "order" | "module_order" | "moduleOrder") => Number(item[key] ?? asRecord(item.params)[key] ?? 0);
  return items.sort((a, b) => (
    (entryOrder(a, "module_order") || entryOrder(a, "moduleOrder")) - (entryOrder(b, "module_order") || entryOrder(b, "moduleOrder"))
    || entryOrder(a, "order") - entryOrder(b, "order")
  ));
}

async function expandTemplate(configRoot: string, templateId: string, params: Params, seen = new Set<string>()) {
  const id = normalizeKey(templateId);
  if (seen.has(id)) return [];
  seen.add(id);
  const templatesRoot = path.resolve(configRoot, "table_layouts", "templates");
  const data = asRecord(await readJson(safeFile(templatesRoot, id)));
  const mergedParams = { ...asRecord(data.params), ...params };
  const entries = sorted([...asArray(data.includes), ...asArray(data.blocks)] as Record<string, unknown>[]);
  const blocks: QcLayoutBlock[] = [];

  for (const entry of entries) {
    const item = asRecord(entry);
    const isInclude = asString(item.type) === "include" || !!item.template_id;
    if (!isInclude) {
      const block = mapBlock(item, mergedParams);
      if (block) blocks.push(block);
      continue;
    }

    const variantKeys = [asString(item.variant_param), ...asArray(item.variant_param_aliases).map((alias) => asString(alias))].filter(Boolean);
    const variantValue = variantKeys.map((key) => asString(mergedParams[key])).find(Boolean) || (variantKeys.length ? asString(item.default_variant) : "");
    const variantRaw = asRecord(item.variants)[variantValue];
    const variant = typeof variantRaw === "string" ? { template_id: variantRaw } : asRecord(variantRaw);
    if (variant.skip === true) continue;
    const childId = asString(variant.template_id || item.template_id);
    if (!childId) continue;
    const childParams = { ...asRecord(item.params), ...mergedParams, ...asRecord(variant.params) };
    blocks.push(...await expandTemplate(configRoot, childId, childParams, new Set(seen)));
  }

  return blocks;
}

export async function loadQcLayoutBlocks(
  configRoot: string,
  layout?: QcTemplateLayoutAssignment,
): Promise<QcLayoutBlock[] | undefined> {
  if (!layout) return undefined;
  const templateBlocks = layout.templateId ? await expandTemplate(configRoot, layout.templateId, layout.params).catch(() => []) : [];
  if (templateBlocks.length) return templateBlocks;
  return undefined;
}
