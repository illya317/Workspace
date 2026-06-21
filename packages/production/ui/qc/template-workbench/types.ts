import type {
  QcTemplateDetail,
  QcTemplateFeedbackContext,
  QcTemplateStage,
  QcTemplateTestItem,
} from "@workspace/production/server/qc";

export type PreviewKind = "precheck" | "experiment" | "test";

export interface WorkbenchSelection {
  template: QcTemplateDetail;
  stage: QcTemplateStage;
  stageIndex: number;
  kind: PreviewKind;
  test?: QcTemplateTestItem;
}

export type FeedbackTarget = WorkbenchSelection & {
  context: QcTemplateFeedbackContext;
};

export const numerals = ["一", "二", "三", "四", "五", "六"];

export function feedbackContext(target: WorkbenchSelection): QcTemplateFeedbackContext {
  const { template, stage, kind, test } = target;
  return {
    productKey: template.id,
    productName: template.productName,
    stageKey: stage.key,
    stageLabel: stage.label,
    itemType: kind,
    sequence: test?.sequence,
    testName: test?.name,
    testNameEn: test?.englishName,
    methodName: test?.methodName,
    layoutKey: test?.layout?.key,
    templateId: test?.layout?.templateId,
  };
}

export function feedbackKey(context: QcTemplateFeedbackContext) {
  return [
    context.productKey,
    context.stageKey,
    context.itemType,
    context.testNameEn || context.sequence || context.templateId || context.testName,
  ].filter(Boolean).map((part) => String(part).trim().replace(/\s+/g, "_")).join("/");
}

export function selectionTitle(selection: WorkbenchSelection) {
  if (selection.kind === "precheck") return `${selection.template.productName} · ${selection.stage.label} · 检验前确认`;
  if (selection.kind === "experiment") return `${selection.template.productName} · ${selection.stage.label} · 实验项目`;
  return `${selection.template.productName} · ${selection.stage.label} · ${selection.test?.sequence} ${selection.test?.name}`;
}
