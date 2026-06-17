import {
  asArray,
  asRecord,
  asString,
  stringArrayRecord,
  stringRecord,
  type LayoutParams,
} from "./layout-block-utils";
import { paramScope, textParts } from "./layout-inline-parts";
import type { QcLayoutBlock, QcLayoutCell, QcLayoutPart } from "./types";

type Params = LayoutParams;

function part(raw: unknown): QcLayoutPart {
  const data = asRecord(raw);
  return {
    type: asString(data.type, "text"),
    text: asString(data.text) || undefined,
    field: asString(data.field) || undefined,
    fieldKey: asString(data.field_key || data.fieldKey || data.key) || undefined,
    options: asArray(data.options).map((item) => asString(item)).filter(Boolean),
    readonlyDisplay: data.readonly_display === true || data.readOnlyDisplay === true,
    advancedFormulaText: asString(data.advanced_formula_text || data.advancedFormulaText) || undefined,
    advancedFormulaTextMap: stringRecord(data.advanced_formula_text_map || data.advancedFormulaTextMap),
    advancedFormulaValueFieldKey: asString(data.advanced_formula_value_field_key || data.advancedFormulaValueFieldKey) || undefined,
    advancedDependencyFieldKeys: asArray(data.advanced_dependency_field_keys || data.advancedDependencyFieldKeys).map((item) => asString(item)).filter(Boolean),
    advancedDependencyFieldKeyMap: stringArrayRecord(data.advanced_dependency_field_key_map || data.advancedDependencyFieldKeyMap),
    advancedDependencyValueFieldKey: asString(data.advanced_dependency_value_field_key || data.advancedDependencyValueFieldKey) || undefined,
  };
}

function cell(rawText: string, parts: QcLayoutPart[] = [], colspan = 1): QcLayoutCell {
  return { rawText, parts, colspan, rowspan: 1, isEmpty: false };
}

function fieldCell(field: string, options: string[] = []) {
  return cell("", [{ type: options.length ? "select" : "field", field, options }]);
}

function structuredOperation(raw: Record<string, unknown>, params: Params): QcLayoutBlock | null {
  const scope = paramScope(raw, params);
  const profile = asString(scope.profile, asString(raw.profile));
  const segments = asArray(asRecord(raw.profile_segments || raw.profileSegments)[profile]);
  const parts: QcLayoutPart[] = [];
  segments.forEach((segment, index) => {
    const item = asRecord(segment);
    const template = item.source ? asString(scope[asString(item.source)]) : asString(item.template);
    const keyPrefix = `layout/operation/${asString(item.label, `segment_${index + 1}`)}`;
    const valueParts = textParts(template, scope, keyPrefix);
    if (!valueParts.length) return;
    const label = asString(item.label);
    if (parts.length) parts.push({ type: "text", text: " " });
    if (label) parts.push({ type: "text", text: `${label}：` });
    parts.push(...valueParts);
  });
  return parts.length ? { type: "paragraph", parts, order: Number(raw.order) || undefined, moduleOrder: Number(raw.module_order || raw.moduleOrder) || undefined } : null;
}

function relatedPeakCalculation(raw: Record<string, unknown>, params: Params): QcLayoutBlock {
  const systemRows = asArray(params[asString(raw.system_rows_param || raw.systemRowsParam)]);
  const peakRows = asArray(params[asString(raw.peak_rows_param || raw.peakRowsParam)]);
  const resultRows = asArray(params[asString(raw.result_rows_param || raw.resultRowsParam)]);
  const rows: QcLayoutCell[][] = [
    [cell("项目"), cell("记录", [], 2)],
    ...systemRows.map((row) => {
      const item = asRecord(row);
      return [cell(asString(item.text || item.label)), fieldCell(asString(item.field), asArray(item.options).map((option) => asString(option)).filter(Boolean)), cell("")];
    }),
    ...peakRows.map((row) => {
      const item = asRecord(row);
      return [cell(asString(item.group)), cell(asString(item.item)), fieldCell(asString(item.field))];
    }),
    ...resultRows.map((row) => {
      const item = asRecord(row);
      return [cell(asString(item.label)), cell("", asArray(item.parts).map(part), 2)];
    }),
  ];
  return { type: "table", label: asString(raw.label), rows, order: Number(raw.order) || undefined };
}

function relatedWeighing(raw: Record<string, unknown>, params: Params): QcLayoutBlock {
  const sourceRows = asArray(params[asString(raw.rows_param || raw.rowsParam)]);
  const rows: QcLayoutCell[][] = [
    [cell("名称"), cell("含量/规格"), cell("称样")],
    ...sourceRows.map((row, index) => {
      const item = asRecord(row);
      const no = index + 1;
      return [
        cell(asString(item.name)),
        cell(asString(item.content)),
        cell("", [
          { type: "field", field: asString(item.field || `称样${no}-毛重`) },
          { type: "text", text: ` ${asString(item.unit)}` },
        ]),
      ];
    }),
  ];
  return { type: "table", label: asString(raw.label), rows, order: Number(raw.order) || undefined };
}

function experimentProjectsTable(raw: Record<string, unknown>, params: Params): QcLayoutBlock | null {
  const sourceRows = asArray(params[asString(raw.tests_param || raw.testsParam, "tests")]);
  if (!sourceRows.length) return null;
  const rows: QcLayoutCell[][] = [
    [cell("序号"), cell("项目"), cell("方法"), cell("组件")],
    ...sourceRows.map((row) => {
      const item = asRecord(row);
      return [
        cell(asString(item.sequence)),
        cell(asString(item.name)),
        cell(asString(item.methodName || item.method_name)),
        cell(asString(item.templateId || item.template_id)),
      ];
    }),
  ];
  return {
    type: "table",
    label: asString(raw.label, "experiment-projects"),
    sectionSuffix: asString(raw.section_suffix || raw.sectionSuffix || raw.section_no || raw.sectionNo) || undefined,
    rows,
    order: Number(raw.order) || undefined,
  };
}

function precheckFilesTable(raw: Record<string, unknown>, params: Params): QcLayoutBlock {
  const scope = paramScope(raw, params);
  const files = asArray(scope[asString(raw.files_param || raw.filesParam, "precheck_files")]);
  const section = asString(raw.section_suffix || raw.sectionSuffix || raw.section_no || raw.sectionNo, "1.1");
  const title = asString(raw.file_title || raw.fileTitle || raw.title, "文件");
  const fieldPrefix = asString(raw.field_prefix || raw.fieldPrefix, "pre_check");
  const rows: QcLayoutCell[][] = [
    [cell(`${section} ${title}`, [], 3)],
    [cell("文件名称"), cell("文件编码"), cell("是否在实验现场")],
    ...files.map((file, index) => {
      const item = asRecord(file);
      return [
        cell(asString(item.name || item["名称"])),
        cell(asString(item.code || item["编码"])),
        cell("", [{ type: "radio", fieldKey: `${fieldPrefix}/file_${index + 1}`, options: ["是", "否"] }]),
      ];
    }),
  ];
  return {
    type: "table",
    label: asString(raw.label, "precheck-files"),
    rows,
    order: Number(raw.order) || undefined,
    moduleOrder: Number(raw.module_order || raw.moduleOrder) || undefined,
  };
}

function precheckConfirmTable(raw: Record<string, unknown>, params: Params): QcLayoutBlock {
  const scope = paramScope(raw, params);
  const items = asArray(scope[asString(raw.items_param || raw.itemsParam, "precheck_items")]);
  const envOptions = asArray(scope[asString(raw.env_options_param || raw.envOptionsParam, "precheck_env_options")])
    .map((option) => asString(option))
    .filter(Boolean);
  const sectionBase = asString(raw.section_base || raw.sectionBase || raw.section_suffix || raw.sectionSuffix || raw.section_no || raw.sectionNo, "1");
  const envTitle = asString(raw.environment_title || raw.environmentTitle, "实验环境");
  const fieldPrefix = asString(raw.field_prefix || raw.fieldPrefix, "pre_check");
  const rows: QcLayoutCell[][] = [
    ...items.map((item, index) => {
      const data = asRecord(item);
      return [
        cell(`${sectionBase}.${index + 2} ${asString(data.name || data["名称"])}`, [], 1),
        cell("", [{ type: "radio", fieldKey: `${fieldPrefix}/confirm_${index + 1}`, options: ["是", "否"] }], 1),
      ];
    }),
    [
      cell(`${sectionBase}.${items.length + 2} ${envTitle}`, [], 1),
      cell("", [{ type: "radio", fieldKey: `${fieldPrefix}/env`, options: envOptions.length ? envOptions : ["符合要求", "不符合要求"] }], 1),
    ],
  ];
  return {
    type: "table",
    label: asString(raw.label, "precheck-confirm"),
    rows,
    order: Number(raw.order) || undefined,
    moduleOrder: Number(raw.module_order || raw.moduleOrder) || undefined,
  };
}

function sectionedOperationSteps(raw: Record<string, unknown>, params: Params): QcLayoutBlock | null {
  const scope = paramScope(raw, params);
  const steps = asArray(scope[asString(raw.steps_param || raw.stepsParam, "identification_steps")]);
  const parts: QcLayoutPart[] = [];
  let lastSectionSuffix = "";
  for (const step of steps) {
    const item = asRecord(step);
    const sectionSuffix = asString(item.section_suffix || item.sectionSuffix);
    const title = asString(item.title || item.text);
    const body = asString(item.body);
    if (!sectionSuffix || !title) continue;
    lastSectionSuffix = sectionSuffix;
    if (parts.length) parts.push({ type: "br" });
    parts.push({ type: "section_heading", text: title, sectionSuffix, bold: true });
    if (body) parts.push({ type: "br" }, { type: "text", text: body });
  }
  return parts.length ? {
    type: "paragraph",
    sectionSuffix: lastSectionSuffix,
    parts,
    order: Number(raw.order) || undefined,
    moduleOrder: Number(raw.module_order || raw.moduleOrder) || undefined,
  } : null;
}

export function mapCustomLayoutBlock(raw: Record<string, unknown>, params: Params): QcLayoutBlock | null {
  const type = asString(raw.type);
  if (type === "structured_operation_method" || type === "related_substances_operation_method") return structuredOperation(raw, params);
  if (type === "related_substances_peak_area_calculation") return relatedPeakCalculation(raw, params);
  if (type === "related_substances_weighing_table") return relatedWeighing(raw, params);
  if (type === "experiment_projects_table") return experimentProjectsTable(raw, params);
  if (type === "precheck_files_table") return precheckFilesTable(raw, params);
  if (type === "precheck_confirm_table") return precheckConfirmTable(raw, params);
  if (type === "sectioned_operation_steps") return sectionedOperationSteps(raw, params);
  return null;
}
