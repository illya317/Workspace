"use client";

import type { ReactNode } from "react";
import { matchText } from "@workspace/core/search";
import { createPageBody, createPageTableBlock, PageSurface } from "@workspace/core/ui";
import type { QcTemplateDetail, QcTemplateFeedbackState, QcTemplateStage, QcTemplateTestItem } from "@workspace/production/server/qc";
import {
  feedbackContext,
  feedbackKey,
  numerals,
  type FeedbackTarget,
  type PreviewKind,
  type WorkbenchSelection,
} from "./types";

interface StageRowsProps {
  template: QcTemplateDetail;
  stage: QcTemplateStage;
  index: number;
  keyword: string;
  expanded: boolean;
  feedbackStates: Record<string, QcTemplateFeedbackState>;
  previewLoadingKey?: string;
  onToggle: () => void;
  onPreview: (selection: WorkbenchSelection) => void;
  onFeedback: (target: FeedbackTarget) => void;
}

interface TemplateDisplayRow {
  key: string;
  badge: string;
  title: string;
  description: string;
  inset?: boolean;
  feedbackState?: QcTemplateFeedbackState;
  previewLoading?: boolean;
  onPreview: () => void;
  onFeedback: () => void;
}

export function testMatches(test: QcTemplateTestItem, keyword: string) {
  return [test.sequence, test.name, test.englishName, test.methodName, test.layout?.templateId]
    .some((value) => matchText(String(value ?? ""), keyword));
}

function feedbackVariant(state?: QcTemplateFeedbackState) {
  return state === "open" ? "danger" : "secondary";
}

function feedbackLabel(state: QcTemplateFeedbackState | undefined, label: ReactNode) {
  const dotClass = state === "open" ? "bg-red-600" : state === "resolved" ? "bg-emerald-700" : undefined;
  return (
    <>
      {dotClass ? <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${dotClass}`} /> : null}
      {label}
    </>
  );
}

function stageFeedbackSummary(
  templateDetail: QcTemplateDetail,
  stageDetail: QcTemplateStage,
  stageIndexValue: number,
  feedbackStates: Record<string, QcTemplateFeedbackState>,
) {
  const selection = (previewKind: PreviewKind, testItem?: QcTemplateTestItem): WorkbenchSelection => ({
    template: templateDetail,
    stage: stageDetail,
    stageIndex: stageIndexValue,
    kind: previewKind,
    test: testItem,
  });
  const states = [
    feedbackStates[feedbackKey(feedbackContext(selection("precheck")))],
    feedbackStates[feedbackKey(feedbackContext(selection("experiment")))],
    ...stageDetail.tests.map((test) => feedbackStates[feedbackKey(feedbackContext(selection("test", test)))]),
  ].filter(Boolean);
  const open = states.filter((state) => state === "open").length;
  const resolved = states.filter((state) => state === "resolved").length;
  if (open > 0) return { state: "open" as const, label: `${open} 项待处理` };
  if (resolved > 0) return { state: "resolved" as const, label: `${resolved} 项已解决` };
  return null;
}

function StageFeedbackBadge({ summary }: { summary: ReturnType<typeof stageFeedbackSummary> }) {
  if (!summary) return null;
  const className = summary.state === "open"
    ? "border-red-300 bg-red-50 text-red-700"
    : "border-emerald-300 bg-emerald-50 text-emerald-800";
  const dotClass = summary.state === "open" ? "bg-red-600" : "bg-emerald-700";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      {summary.label}
    </span>
  );
}

export default function StageRows({
  template,
  stage,
  index,
  keyword,
  expanded,
  feedbackStates,
  previewLoadingKey,
  onToggle,
  onPreview,
  onFeedback,
}: StageRowsProps) {
  const tests = keyword ? stage.tests.filter((test) => testMatches(test, keyword)) : stage.tests;
  if (keyword && tests.length === 0 && !matchText(stage.label, keyword)) return null;
  const summary = stageFeedbackSummary(template, stage, index, feedbackStates);

  function select(previewKind: PreviewKind, testItem?: QcTemplateTestItem): WorkbenchSelection {
    return {
      template,
      stage,
      stageIndex: index,
      kind: previewKind,
      test: testItem,
    };
  }

  function feedback(selection: WorkbenchSelection) {
    const context = feedbackContext(selection);
    onFeedback({ ...selection, context });
  }

  function feedbackState(selection: WorkbenchSelection) {
    return feedbackStates[feedbackKey(feedbackContext(selection))];
  }

  function previewKey(selection: WorkbenchSelection) {
    return `${selection.template.id}:${selection.stage.key}:${selection.kind}:${selection.test?.englishName || ""}`;
  }

  const rows: TemplateDisplayRow[] = [
    {
      key: "precheck",
      badge: "1",
      title: "检验前确认",
      description: "L1 模块 · YAML 文件清单 / 确认项 / 环境确认",
      feedbackState: feedbackState(select("precheck")),
      previewLoading: previewLoadingKey === previewKey(select("precheck")),
      onPreview: () => onPreview(select("precheck")),
      onFeedback: () => feedback(select("precheck")),
    },
    {
      key: "experiment",
      badge: "2",
      title: "实验项目",
      description: `L1 模块 · ${stage.tests.length} 个项目`,
      feedbackState: feedbackState(select("experiment")),
      previewLoading: previewLoadingKey === previewKey(select("experiment")),
      onPreview: () => onPreview(select("experiment")),
      onFeedback: () => feedback(select("experiment")),
    },
    ...tests.map((test): TemplateDisplayRow => ({
      key: `test:${test.englishName}`,
      badge: test.sequence,
      title: test.name,
      description: `${test.methodName || "未配置方法"} · ${test.layout?.templateId || "未映射组件"}`,
      inset: true,
      feedbackState: feedbackState(select("test", test)),
      previewLoading: previewLoadingKey === previewKey(select("test", test)),
      onPreview: () => onPreview(select("test", test)),
      onFeedback: () => feedback(select("test", test)),
    })),
  ];

  return (
    <PageSurface
      kind="detail"
      embedded
      body={createPageBody([
        createPageTableBlock<TemplateDisplayRow>("qc-template-stage-rows", {
          framed: true,
          title: (
            <span className="flex min-w-0 items-center gap-3">
              <span className="truncate">{numerals[index] ?? index + 1}、{template.productName}{stage.label}</span>
              <StageFeedbackBadge summary={summary} />
            </span>
          ),
          actions: [{
            key: "toggle",
            label: `${expanded ? "收起" : "展开"} · ${stage.tests.length} 个实验项目`,
            variant: "secondary",
            size: "sm",

            onClick: onToggle,
          }],
          rows: expanded ? rows : [],
          columns: [
            {
              key: "title",
              label: "项目",
              required: true,
              cell: (row) => (
                <div className={`flex min-w-0 items-start gap-3 ${row.inset ? "pl-5" : ""}`}>
                  <span className="min-w-9 rounded-full bg-blue-50 px-3 py-1 text-center text-xs font-semibold text-blue-700">{row.badge}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-slate-900">{row.title}</span>
                    <span className="mt-1 block truncate text-xs text-slate-500">{row.description}</span>
                  </span>
                </div>
              ),
            },
            {
              key: "actions",
              label: "操作",
              required: true,
              cell: (row) => ({
                kind: "actions",
                align: "right",
                actions: [
                  {
                    key: "feedback",
                    label: feedbackLabel(row.feedbackState, "反馈"),
                    variant: feedbackVariant(row.feedbackState),
                    size: "sm",

                    onClick: row.onFeedback,
                  },
                  {
                    key: "preview",
                    label: row.previewLoading ? "加载中" : "预览",
                    disabled: row.previewLoading,
                    size: "sm",

                    onClick: row.onPreview,
                  },
                ],
              }),
            },
          ],
          visibleColumns: ["title", "actions"],
          rowKey: (row) => row.key,
          emptyText: expanded ? "暂无项目。" : "已收起。",
        }),
      ])}
    />
  );
}
