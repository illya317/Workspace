import type { QcLayoutBlock, QcLayoutCell, QcLayoutPart } from "./types";

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

function paramScope(raw: Record<string, unknown>, params: Params) {
  const path = asString(raw.params_path || raw.paramsPath);
  return path ? { ...params, ...asRecord(params[path]) } : params;
}

function formatText(text: string, params: Params) {
  return text
    .replace(/\[([^\]]*\{([\w.-]+)\}[^\]]*)\]/g, (match, body, key) => params[key] == null || params[key] === "" ? "" : body)
    .replace(/\{\{\s*([\w.-]+)\s*\}\}|\{\s*([\w.-]+)\s*\}/g, (match, a, b) => {
      const value = params[a || b];
      return value === undefined || typeof value === "object" ? match : String(value);
    });
}

function part(raw: unknown): QcLayoutPart {
  const data = asRecord(raw);
  return {
    type: asString(data.type, "text"),
    text: asString(data.text) || undefined,
    field: asString(data.field) || undefined,
    fieldKey: asString(data.field_key || data.fieldKey || data.key) || undefined,
    options: asArray(data.options).map((item) => asString(item)).filter(Boolean),
    readonlyDisplay: data.readonly_display === true || data.readOnlyDisplay === true,
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
  const text = segments.map((segment) => {
    const item = asRecord(segment);
    const value = item.source ? asString(scope[asString(item.source)]) : formatText(asString(item.template), scope);
    return value ? `${asString(item.label)}：${value}` : "";
  }).filter(Boolean).join(" ");
  return text ? { type: "paragraph", parts: [{ type: "text", text }], order: Number(raw.order) || undefined, moduleOrder: Number(raw.module_order || raw.moduleOrder) || undefined } : null;
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
  if (type === "sectioned_operation_steps") return sectionedOperationSteps(raw, params);
  return null;
}
