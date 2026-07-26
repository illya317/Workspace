import {
  type BodySurfaceSectionSpec,
  type FormSurfaceFieldSpec,
  type FormSurfaceItemSpec,
  type InputFieldSpec,
} from "@workspace/core/ui";
import type {
  EditorBlock,
  EditorInline,
  EditorSlotInline,
  EditorTableBlock,
  EditorTableCell,
  FieldModel,
} from "@workspace/platform/document-editor";
import { resolveQcEditorRuntimeField, type QcEditorRuntimeFieldContext } from "./qc-editor-runtime-field";
import type { EditorRuntimeValues } from "./useEditorRuntimeFormulaEngine";

export interface QcEditorRuntimeMobileProps {
  blocks: EditorBlock[];
  fieldModel: FieldModel;
  values: EditorRuntimeValues;
  referenceValues?: EditorRuntimeValues;
  onFieldChange?: (key: string, value: string) => void;
  readOnly?: boolean;
}

interface MobileRecordGroup {
  key: string;
  title: string;
  items: FormSurfaceItemSpec[];
}

interface TableFieldContext {
  cell: EditorTableCell;
  cellIndex: number;
  headers: string[];
  rowTexts: string[];
}

const FIELD_LABELS: Record<string, string> = {
  batch_number: "批号",
  request_date: "请验日期",
  inspection_date: "检验日期",
  completion_date: "完成日期",
  judgment_date: "判定日期",
  report_date: "报告日期",
  room_name: "房间名称",
  room_no: "房间编号",
  temperature: "温度",
  humidity: "湿度",
  device_no: "设备编号",
  valid_until: "有效期至",
  confirmed: "是否确认",
  batch_no: "批号",
  process: "检测过程",
  result: "判定结果",
  inspector: "检验者",
  reviewer: "复核者",
  review_date: "复核日期",
  quantity_2: "检品数量",
  confirm: "确认结果",
  env: "确认结果",
  file: "是否在实验现场",
  occurred: "是否发生异常",
  code: "异常编号",
  date: "日期",
};

/** @ui-structural-declaration Mobile QC maps one editor document slice to Core form sections. */
export function createQcEditorRuntimeMobileSection(
  key: string,
  props: QcEditorRuntimeMobileProps,
): BodySurfaceSectionSpec {
  const groups = runtimeGroups(props);
  const sections = groups.map((group): BodySurfaceSectionSpec => ({
    key: group.key,
    label: group.title,
    header: { title: group.title },
    body: {
      kind: "form",
      form: {
        kind: "fields",
        content: {
          items: group.items,
          layout: { flow: "single", columns: 1, mode: "mixed", density: "normal" },
        },
      },
    },
  }));

  return {
    key,
    visibility: "mobile",
    body: {
      kind: "section",
      title: "检验记录",
      mobilePresentation: sections.length > 1 ? "drilldown" : "stack",
      sections,
      empty: sections.length ? undefined : { content: "当前检验项目没有可填写内容。" },
    },
  };
}

function runtimeGroups(props: QcEditorRuntimeMobileProps) {
  const groups: MobileRecordGroup[] = [];
  const seenFields = new Set<string>();
  let sequence = 0;
  let current: MobileRecordGroup = { key: `${sequence}-overview`, title: "检验信息", items: [] };
  const context: QcEditorRuntimeFieldContext = props;

  const flush = () => {
    if (current.items.length) groups.push(current);
  };
  const nextGroup = (title: string, blockId: string) => {
    flush();
    sequence += 1;
    current = {
      key: `${sequence}-${safeKey(blockId)}`,
      title: cleanHeading(title) || `检验章节 ${sequence + 1}`,
      items: [],
    };
  };
  const addNote = (content: string, sourceKey: string) => {
    const normalized = cleanText(content);
    if (!normalized || current.items.some((item) => item.kind === "note" && item.content === normalized)) return;
    current.items.push({ kind: "note", key: `note-${safeKey(sourceKey)}-${current.items.length}`, content: normalized });
  };
  const addSlot = (part: EditorSlotInline, sourceKey: string, table?: TableFieldContext) => {
    if (seenFields.has(part.fieldKey)) return;
    seenFields.add(part.fieldKey);
    const item = mobileFieldItem(part, context, table);
    current.items.push(item);
    if (part.withTime || item.spec.valueType === "datetime") {
      const hourKey = `${part.fieldKey}_hour`;
      if (!seenFields.has(hourKey)) {
        seenFields.add(hourKey);
        current.items.push(timeFieldItem(hourKey, `${String(item.label)}时间`, context, item.spec.state === "readonly"));
      }
    }
  };

  for (const block of props.blocks) {
    if (block.type === "heading") {
      nextGroup(block.text, block.id);
      continue;
    }
    if (block.type === "paragraph") {
      const narrative = inlineNarrative(block.parts, props.fieldModel);
      if (narrative) addNote(narrative, block.id);
      block.parts.forEach((part) => {
        if (part.type !== "text") addSlot(part, block.id);
      });
      continue;
    }
    if (block.type === "table") {
      const tableTitle = cleanText(block.title || "");
      if (tableTitle && current.items.length) nextGroup(tableTitle, block.id);
      const headers = tableHeaders(block);
      block.rows.forEach((row, rowIndex) => {
        if (headers.rowIndex === rowIndex) return;
        const rowTexts = row.cells.map(cellText);
        const slots = row.cells.flatMap((cell, cellIndex) => cell.parts
          .filter((part): part is EditorSlotInline => part.type !== "text")
          .map((part) => ({ part, cell, cellIndex })));
        if (!slots.length) {
          addNote(staticRowText(rowTexts), `${block.id}-${rowIndex}`);
          return;
        }
        slots.forEach(({ part, cell, cellIndex }) => addSlot(part, `${block.id}-${rowIndex}-${cellIndex}`, {
          cell,
          cellIndex,
          headers: headers.values,
          rowTexts,
        }));
      });
      continue;
    }
    if (block.type === "attachment") {
      if (current.items.length) nextGroup(block.title, block.id);
      addNote(block.text || block.title, block.id);
      const storedValue = props.values[block.fieldKey];
      if (storedValue) {
        current.items.push({
          kind: "readonly",
          key: block.fieldKey,
          label: block.title,
          value: storedValue,
          placeholder: "暂无附件",
        });
      }
    }
  }
  flush();
  return groups;
}

function mobileFieldItem(
  part: EditorSlotInline,
  context: QcEditorRuntimeFieldContext,
  table?: TableFieldContext,
): FormSurfaceFieldSpec {
  const resolved = resolveQcEditorRuntimeField(part, context);
  const label = fieldLabel(part, resolved.field?.label || resolved.field?.name, table);
  const state: InputFieldSpec["state"] = resolved.disabled ? "readonly" : resolved.field?.required ? "required" : "normal";
  const spec = inputSpec(resolved.inputType, resolved.valueType, resolved.options, state, Boolean(part.withTime));
  const hints = [
    part.unit || resolved.field?.unit,
    tableHint(table, label),
    part.slotKind === "formula" ? "自动计算" : undefined,
    part.slotKind === "reference" || part.referenceFieldKey ? "引用值" : undefined,
    part.type === "signatureSlot" ? "随检验或复核记录" : undefined,
  ].filter((value): value is string => Boolean(value && cleanText(value)));
  return {
    key: part.fieldKey,
    label,
    spec,
    value: resolved.value,
    placeholder: part.placeholder || resolved.field?.defaultValue || "请输入",
    hint: [...new Set(hints)].join(" · ") || undefined,
    required: Boolean(resolved.field?.required),
    ariaLabel: label,
    dataFieldKey: part.fieldKey,
    inputMode: spec.valueType === "number" ? "decimal" : undefined,
    onChange: resolved.disabled
      ? undefined
      : (next) => context.onFieldChange?.(part.fieldKey, normalizedChangeValue(next)),
  };
}

function timeFieldItem(
  key: string,
  label: string,
  context: QcEditorRuntimeFieldContext,
  readOnly: boolean,
): FormSurfaceFieldSpec {
  return {
    key,
    label,
    spec: {
      control: "temporal",
      valueType: "time",
      precision: "time",
      usage: "form",
      state: readOnly ? "readonly" : "normal",
    },
    value: context.values[key] ?? "",
    ariaLabel: label,
    dataFieldKey: key,
    onChange: readOnly ? undefined : (next) => context.onFieldChange?.(key, normalizedChangeValue(next)),
  };
}

function inputSpec(
  inputType: string,
  valueType: string | undefined,
  options: string[] | undefined,
  state: InputFieldSpec["state"],
  withTime: boolean,
): InputFieldSpec {
  const choice = inputType === "radio" || inputType === "checkbox" || inputType === "select" || Boolean(options?.length);
  if (choice) {
    return {
      control: "choice",
      valueType: inputType === "checkbox" ? "array" : "string",
      options: { source: "static", items: (options ?? []).map((option) => ({ value: option, label: option })) },
      presentation: inputType === "select" ? undefined : "choice",
      multiple: inputType === "checkbox",
      usage: "form",
      state,
    };
  }
  if (inputType === "date" || inputType === "datetime" || valueType === "date" || valueType === "datetime") {
    return {
      control: "temporal",
      valueType: withTime || valueType === "datetime" ? "datetime" : "date",
      precision: withTime || valueType === "datetime" ? "datetime" : "date",
      format: withTime || valueType === "datetime" ? "datetime" : "date",
      usage: "form",
      state,
    };
  }
  if (valueType === "number" || inputType === "number") {
    return { control: "number", valueType: "number", format: "number", usage: "form", state };
  }
  return { control: "text", valueType: "string", usage: "form", state };
}

function fieldLabel(part: EditorSlotInline, modelLabel: string | undefined, table?: TableFieldContext) {
  if (part.type === "signatureSlot") {
    if (part.role === "reviewer") return "复核者";
    if (part.role === "inspector") return "检验者";
  }
  const direct = [part.label, modelLabel, part.alias === "i" || part.alias === "人名" ? undefined : part.alias]
    .map((value) => cleanText(value || ""))
    .find(Boolean);
  if (direct) return direct;

  if (table) {
    const own = cellText(table.cell);
    if (own && !isUnitText(own)) return own;
    const previous = cleanText(table.rowTexts[table.cellIndex - 1] || "");
    const header = cleanText(table.headers[table.cellIndex] || "");
    const descriptor = cleanText(table.rowTexts.find((text, index) => index !== table.cellIndex && text) || "");
    if (header && descriptor && header !== descriptor) return `${descriptor} · ${header}`;
    if (previous && looksLikeLabel(previous)) return previous;
    if (header) return header;
    if (previous) return previous;
  }
  const suffix = part.fieldKey.split("/").pop() || part.fieldKey;
  const normalized = suffix.replace(/_\d+$/, "");
  return FIELD_LABELS[normalized] || part.placeholder || suffix.replace(/_/g, " ");
}

function tableHint(table: TableFieldContext | undefined, label: string) {
  if (!table) return undefined;
  const values = table.rowTexts
    .filter((value) => value && value !== label)
    .filter((value, index, array) => array.indexOf(value) === index);
  const header = cleanText(table.headers[table.cellIndex] || "");
  const selected = values.filter((value) => value !== header).slice(0, 2);
  return selected.length ? selected.join(" · ") : header && header !== label ? header : undefined;
}

function tableHeaders(block: EditorTableBlock) {
  if (block.label === "stage_header") return { rowIndex: -1, values: [] as string[] };
  for (let index = 0; index < block.rows.length - 1; index += 1) {
    const row = block.rows[index];
    const next = block.rows[index + 1];
    if (row.cells.length < 2 || row.cells.length !== next.cells.length) continue;
    if (row.cells.some((cell) => cell.parts.some((part) => part.type !== "text"))) continue;
    if (!next.cells.some((cell) => cell.parts.some((part) => part.type !== "text"))) continue;
    return { rowIndex: index, values: row.cells.map(cellText) };
  }
  return { rowIndex: -1, values: [] as string[] };
}

function inlineNarrative(parts: EditorInline[], fieldModel: FieldModel) {
  const hasSlot = parts.some((part) => part.type !== "text");
  if (!hasSlot) return cleanText(parts.map((part) => part.type === "text" ? part.text : "").join(""));
  const narrative = cleanText(parts.map((part) => {
    if (part.type === "text") return part.text;
    const resolved = resolveQcEditorRuntimeField(part, { fieldModel, values: {}, readOnly: true });
    return `【${fieldLabel(part, resolved.field?.label || resolved.field?.name)}】`;
  }).join(""));
  return narrative.length >= 16 ? narrative : "";
}

function staticRowText(values: string[]) {
  const compact = values.map(cleanText).filter(Boolean);
  if (!compact.length) return "";
  if (compact.length === 1) return compact[0];
  if (compact.length % 2 === 0) {
    const pairs: string[] = [];
    for (let index = 0; index < compact.length; index += 2) {
      pairs.push(`${compact[index]}：${compact[index + 1]}`);
    }
    return pairs.join(" · ");
  }
  return compact.join(" · ");
}

function cellText(cell: EditorTableCell) {
  return cleanText(cell.parts.filter((part) => part.type === "text").map((part) => part.text).join("") || cell.rawText || "");
}

function looksLikeLabel(value: string) {
  return value.length <= 12 && !/[《》]/.test(value) && !/^(?:SOP|MQS|\d{4,})/i.test(value);
}

function isUnitText(value: string) {
  return /^(?:℃|°C|%|mg|g|kg|mL|ml|L|h|min|s|nm)$/i.test(value);
}

function normalizedChangeValue(value: unknown) {
  if (Array.isArray(value)) return value.map(String).join(",");
  if (value == null) return "";
  return String(value);
}

function cleanHeading(value: string) {
  return cleanText(value).replace(/^\s*\d+(?:\.\d+)*[、.．]?\s*/, "");
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").replace(/^[：:·,，。\s]+|[：:·,，\s]+$/g, "").trim();
}

function safeKey(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "section";
}
