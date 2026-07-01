import {
  getGeneratedQcTemplateMetrics,
} from "./generated-qc";
import { readTemplateContent } from "./content-store";
import type {
  DocsEditorTemplateRow,
} from "./db";

export type DocsEditorTemplateListRow = Pick<
  DocsEditorTemplateRow,
  | "id"
  | "title"
  | "type"
  | "status"
  | "spaceId"
  | "documentContentRef"
  | "fieldModelContentRef"
  | "sourceKind"
  | "sourceProductKey"
  | "sourceStageKeys"
  | "updatedAt"
>;

type TemplateMetrics = {
  stageCount?: number;
  fieldCount?: number;
  formulaCount?: number;
  tableCount?: number;
};

export async function collectTemplateMetrics(template: DocsEditorTemplateListRow): Promise<TemplateMetrics> {
  if (template.sourceKind === "production.qc.official") {
    const metrics = getGeneratedQcTemplateMetrics(template.sourceProductKey);
    if (metrics) return metrics;
  }

  const content = await readTemplateContent(template);
  const document = content.document;
  const fieldModel = content.fieldModel;
  const fieldKeys = new Set<string>();
  let formulaCount = 0;
  let tableCount = 0;

  walkJson(fieldModel, (node) => {
    const fieldKey = node.fieldKey ?? node.key;
    if (typeof fieldKey === "string" && fieldKey.trim()) fieldKeys.add(fieldKey);
    if (node.formula || node.rule || node.advancedFormulaText) formulaCount += 1;
  });
  walkJson(document, (node) => {
    const kind = node.kind ?? node.type ?? node.blockType;
    if (kind === "table") tableCount += 1;
  });

  return {
    stageCount: jsonArrayLength(template.sourceStageKeys),
    fieldCount: fieldKeys.size,
    formulaCount,
    tableCount,
  };
}

function parseJson(value: string | null | undefined, fallback: unknown) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function jsonArrayLength(value: string | null) {
  const parsed = parseJson(value, []);
  return Array.isArray(parsed) ? parsed.length : 0;
}

function walkJson(value: unknown, visit: (node: Record<string, unknown>) => void) {
  if (Array.isArray(value)) {
    value.forEach((item) => walkJson(item, visit));
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  visit(record);
  Object.values(record).forEach((item) => walkJson(item, visit));
}
