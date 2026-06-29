"use client";

import type { ReactNode } from "react";
import { matchText } from "@workspace/core/search";
import { createPageBody, createPageTableSection, PageSurface } from "@workspace/core/ui";
import type { QcTemplateDetail, QcTemplateFeedbackState, QcTemplateStage, QcTemplateTestItem } from "@workspace/production/server/qc";
import {
  feedbackContext,
  feedbackKey,
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
    <PageSurface kind="standard"
      embedded
      body={createPageBody([
        createPageTableSection<TemplateDisplayRow>("qc-template-stage-rows", {
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
