import type {
  TemplateWorkbenchRowAction,
  TemplateWorkbenchSection,
  TemplateWorkbenchSelectorItem,
  TemplateWorkbenchViewModel,
} from "@workspace/core/ui";
import type {
  QcTemplateDetail,
  QcTemplateFeedbackState,
  QcTemplateStage,
  QcTemplateTestItem,
} from "@workspace/production/server/qc";
import {
  feedbackContext,
  feedbackKey,
  numerals,
  type FeedbackTarget,
  type PreviewKind,
  type WorkbenchSelection,
} from "./types";

interface Options {
  templates: QcTemplateDetail[];
  feedbackStates: Record<string, QcTemplateFeedbackState>;
  previewLoading: string;
  toolbarMeta?: TemplateWorkbenchViewModel["toolbarMeta"];
  onPreview: (selection: WorkbenchSelection) => void;
  onFeedback: (target: FeedbackTarget) => void;
}

function itemCount(template: QcTemplateDetail) {
  return template.stages.reduce((sum, stage) => sum + stage.tests.length, 0);
}

function makeSelection(template: QcTemplateDetail, stage: QcTemplateStage, stageIndex: number, kind: PreviewKind, test?: QcTemplateTestItem): WorkbenchSelection {
  return { template, stage, stageIndex, kind, test };
}

export function previewKey(selection: WorkbenchSelection) {
  return `${selection.template.id}:${selection.stage.key}:${selection.kind}:${selection.test?.englishName || ""}`;
}

function stageFeedbackSummary(template: QcTemplateDetail, stage: QcTemplateStage, stageIndex: number, feedbackStates: Record<string, QcTemplateFeedbackState>) {
  const states = [
    feedbackStates[feedbackKey(feedbackContext(makeSelection(template, stage, stageIndex, "precheck")))],
    feedbackStates[feedbackKey(feedbackContext(makeSelection(template, stage, stageIndex, "experiment")))],
    ...stage.tests.map((test) => feedbackStates[feedbackKey(feedbackContext(makeSelection(template, stage, stageIndex, "test", test)))]),
  ].filter(Boolean);
  const open = states.filter((state) => state === "open").length;
  const resolved = states.filter((state) => state === "resolved").length;
  if (open > 0) return { label: `${open} 项待处理`, tone: "red" as const };
  if (resolved > 0) return { label: `${resolved} 项已解决`, tone: "green" as const };
  return undefined;
}

function actionIndicator(state?: QcTemplateFeedbackState): TemplateWorkbenchRowAction["indicator"] {
  if (state === "open") return "danger";
  if (state === "resolved") return "success";
  return undefined;
}

function rowActions(selection: WorkbenchSelection, options: Options): TemplateWorkbenchRowAction[] {
  const state = options.feedbackStates[feedbackKey(feedbackContext(selection))];
  return [
    {
      label: "反馈",
      indicator: actionIndicator(state),
      variant: state === "open" ? "danger" : "secondary",
      onClick: () => options.onFeedback({ ...selection, context: feedbackContext(selection) }),
    },
    {
      label: "预览",
      loading: options.previewLoading === previewKey(selection),
      onClick: () => options.onPreview(selection),
    },
  ];
}

function createSections(options: Options): TemplateWorkbenchSection[] {
  const firstStageKey = options.templates[0]?.stages[0] ? `${options.templates[0].id}:${options.templates[0].stages[0].key}` : "";
  return options.templates.flatMap((template) => template.stages.map((stage, index) => {
    const sectionKey = `${template.id}:${stage.key}`;
    const precheckSelection = makeSelection(template, stage, index, "precheck");
    const experimentSelection = makeSelection(template, stage, index, "experiment");

    return {
      key: sectionKey,
      selectorKey: template.id,
      title: `${numerals[index] ?? index + 1}、${template.productName}${stage.label}`,
      subtitle: `${template.id} · ${stage.documentCount} 份文件 · ${stage.precheckItemCount} 个确认项 · ${stage.tests.length} 个检测项`,
      searchText: [template.productName, template.id, stage.label],
      status: stageFeedbackSummary(template, stage, index, options.feedbackStates),
      collapsible: true,
      defaultExpanded: sectionKey === firstStageKey,
      toggleCount: stage.tests.length,
      toggleUnit: "个实验项目",
      rows: [
        {
          key: `${sectionKey}:precheck`,
          badge: "1",
          title: "检验前确认",
          description: "YAML 文件清单 / 确认项 / 环境确认",
          searchText: [template.productName, template.id, stage.label, "检验前确认", "YAML", "确认项", "环境确认"],
          actions: rowActions(precheckSelection, options),
        },
        {
          key: `${sectionKey}:experiment`,
          badge: "2",
          title: "实验项目",
          description: `${stage.tests.length} 个项目共用同一纸面模板`,
          searchText: [template.productName, template.id, stage.label, "实验项目", "纸面模板"],
          actions: rowActions(experimentSelection, options),
        },
        ...stage.tests.map((test) => {
          const selection = makeSelection(template, stage, index, "test", test);
          return {
            key: `${sectionKey}:test:${test.englishName || test.sequence}`,
            badge: test.sequence,
            title: test.name,
            description: `${test.methodName || "未配置方法"} · ${test.layout?.templateId || "未映射组件"}`,
            inset: true,
            searchText: [test.sequence, test.name, test.englishName, test.methodName, test.layout?.templateId],
            actions: rowActions(selection, options),
          };
        }),
      ],
    };
  }));
}

function createSelectorItems(templates: QcTemplateDetail[]): TemplateWorkbenchSelectorItem[] {
  return [
    { key: "all", title: "全部产品", trailing: templates.length },
    ...templates.map((template) => ({
      key: template.id,
      title: template.productName,
      subtitle: template.id,
      trailing: `${itemCount(template)} 项`,
    })),
  ];
}

export function createQcTemplateWorkbenchViewModel(options: Options): TemplateWorkbenchViewModel {
  return {
    selectorTitle: "产品",
    selectorItems: createSelectorItems(options.templates),
    searchPlaceholder: "搜索产品、阶段、项目",
    toolbarMeta: options.toolbarMeta ?? `${options.templates.length} 个产品模板`,
    hideToolbar: true,
    sections: createSections(options),
  };
}
