import "server-only";
import path from "path";
import { readFile } from "fs/promises";
import type { QcLayoutBlock, QcLayoutCell, QcLayoutPart, QcRecommendedRange, QcTemplateLayoutAssignment } from "./types";

type Params = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function asNumber(value: unknown, fallback = 1) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function maybeNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function maybePositiveNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

function asRange(value: unknown): QcRecommendedRange | undefined {
  if (Array.isArray(value)) {
    return { min: maybeNumber(value[0]) ?? null, max: maybeNumber(value[1]) ?? null };
  }
  const range = asRecord(value);
  const min = maybeNumber(range.min);
  const max = maybeNumber(range.max);
  return min === undefined && max === undefined ? undefined : { min: min ?? null, max: max ?? null };
}

function normalizeKey(key: string) {
  const clean = path.posix.normalize(key.replace(/\\/g, "/").replace(/\.json$/, ""));
  if (!clean || clean.startsWith("../") || clean === ".." || path.isAbsolute(clean)) {
    throw new Error("Invalid QC layout key");
  }
  return clean;
}

function safeFile(root: string, key: string) {
  const filePath = path.resolve(root, `${normalizeKey(key)}.json`);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid QC layout key");
  }
  return filePath;
}

function widthFromChars(value: unknown) {
  const chars = Number(value);
  if (!Number.isFinite(chars) || chars <= 0) return undefined;
  return `${Math.max(2.5, chars * 0.62)}rem`;
}

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

function paramString(params: Params, name: string) {
  const value = params[name];
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function applyBlockParams(block: Record<string, unknown>, params: Params) {
  const overrideKeys = [
    "temperature_range", "humidity_limit", "room_rows", "devices", "materials", "standards", "items", "field_prefix",
    "section_suffix", "section_slot", "section_role", "section_ref", "section_anchor", "has_value", "auto_judgment",
    "conclusion_name", "unit", "order", "module_order",
  ];
  return Object.fromEntries(Object.entries({ ...block, ...Object.fromEntries(
    overrideKeys.flatMap((key) => params[key] !== undefined ? [[key, params[key]]] : []),
  ) }).map(([key, value]) => [key, substitute(value, params)]));
}

function mapBlock(value: unknown, params: Params = {}): QcLayoutBlock | null {
  const raw = applyBlockParams(asRecord(value), params);
  const type = asString(raw.type, "table");
  const rows = asArray(raw.rows).map((row) => asArray(asRecord(row).cells).map((cell) => mapCell(cell, params)));
  if (type === "table" && rows.length === 0) return null;
  return {
    type,
    label: asString(raw.label) || undefined,
    title: asString(raw.title || raw.text) || undefined,
    text: asString(raw.text || raw.fixed_text) || undefined,
    sectionSuffix: asString(raw.section_suffix || raw.sectionSuffix || raw.section_no || raw.sectionNo) || undefined,
    sectionSlot: asString(raw.section_slot || raw.sectionSlot) || undefined,
    sectionRole: asString(raw.section_role || raw.sectionRole) || undefined,
    sectionRef: asString(raw.section_ref || raw.sectionRef) || undefined,
    sectionAnchor: asBoolean(raw.section_anchor ?? raw.sectionAnchor),
    fieldPrefix: asString(raw.field_prefix || raw.fieldPrefix) || undefined,
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

function substitute(value: unknown, params: Params): unknown {
  if (typeof value === "string") return formatText(value, params);
  if (Array.isArray(value)) return value.map((item) => substitute(item, params));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, substitute(val, params)]));
  }
  return value;
}

function formatText(text: string, params: Params) {
  return text.replace(/\{\{\s*([\w.-]+)\s*\}\}|\{\s*([\w.-]+)\s*\}/g, (match, a, b) => {
    const key = a || b;
    const value = params[key];
    return value === undefined || typeof value === "object" ? match : String(value);
  });
}

async function readJson(filePath: string) {
  const raw = await readFile(filePath, "utf8").catch(() => "");
  return raw ? JSON.parse(raw) as unknown : undefined;
}

function sorted(items: Array<{ order?: unknown; module_order?: unknown; moduleOrder?: unknown }>) {
  return items.sort((a, b) => (
    Number(a.module_order ?? a.moduleOrder ?? 0) - Number(b.module_order ?? b.moduleOrder ?? 0)
    || Number(a.order ?? 0) - Number(b.order ?? 0)
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

    const variantKey = asString(item.variant_param);
    const variantValue = variantKey ? asString(mergedParams[variantKey], asString(item.default_variant)) : "";
    const variant = asRecord(asRecord(item.variants)[variantValue]);
    if (variant.skip === true) continue;
    const childId = asString(variant.template_id || item.template_id);
    if (!childId) continue;
    const childParams = { ...mergedParams, ...asRecord(item.params), ...asRecord(variant.params) };
    blocks.push(...await expandTemplate(configRoot, childId, childParams, new Set(seen)));
  }

  return blocks;
}

async function loadProductBlocks(configRoot: string, key?: string) {
  if (!key) return undefined;
  const layoutRoot = path.resolve(configRoot, "table_layouts");
  const data = asRecord(await readJson(safeFile(layoutRoot, key)));
  const blocks = asArray(data.blocks).map((block) => mapBlock(block)).filter((block): block is QcLayoutBlock => !!block);
  return blocks.length ? blocks : undefined;
}

export async function loadQcLayoutBlocks(
  configRoot: string,
  layout?: QcTemplateLayoutAssignment,
): Promise<QcLayoutBlock[] | undefined> {
  if (!layout) return undefined;
  const templateBlocks = layout.templateId ? await expandTemplate(configRoot, layout.templateId, layout.params).catch(() => []) : [];
  if (templateBlocks.length) return templateBlocks;
  return loadProductBlocks(configRoot, layout.key);
}
