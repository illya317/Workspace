"use client";

import type { ReactNode } from "react";
import type { QcTemplateDetail, QcTemplateFeedbackState, QcTemplateStage, QcTemplateTestItem } from "@/server/services/production/qc";
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
  onToggle: () => void;
  onPreview: (selection: WorkbenchSelection) => void;
  onFeedback: (target: FeedbackTarget) => void;
}

export function testMatches(test: QcTemplateTestItem, keyword: string) {
  return [test.sequence, test.name, test.englishName, test.methodName, test.layout?.templateId]
    .some((value) => (value ?? "").toLowerCase().includes(keyword));
}

function ActionButton({
  state,
  children,
  onClick,
}: {
  state?: QcTemplateFeedbackState;
  children: ReactNode;
  onClick: () => void;
}) {
  const activeClass = state === "open"
    ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
    : state === "resolved"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50";
  const dotClass = state === "open" ? "bg-red-600" : state === "resolved" ? "bg-emerald-700" : "";
  return (
    <button
      onClick={onClick}
      className={`h-9 rounded-md border px-3 text-xs font-semibold ${activeClass}`}
    >
      {state && <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${dotClass}`} />}
      {children}
    </button>
  );
}

function TemplateRow({
  badge,
  title,
  description,
  inset,
  feedbackState,
  onPreview,
  onFeedback,
}: {
  badge: string;
  title: string;
  description: string;
  inset?: boolean;
  feedbackState?: QcTemplateFeedbackState;
  onPreview: () => void;
  onFeedback: () => void;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 px-4 py-3 ${inset ? "pl-9" : ""}`}>
      <div className="flex min-w-0 items-start gap-3">
        <span className="min-w-9 rounded-full bg-blue-50 px-3 py-1 text-center text-xs font-semibold text-blue-700">{badge}</span>
        <div className="min-w-0">
          <div className="truncate font-semibold text-slate-900">{title}</div>
          <div className="mt-1 truncate text-xs text-slate-500">{description}</div>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <ActionButton state={feedbackState} onClick={onFeedback}>反馈</ActionButton>
        <ActionButton onClick={onPreview}>预览</ActionButton>
      </div>
    </div>
  );
}

function stageFeedbackSummary(
  templateDetail: QcTemplateDetail,
  stageDetail: QcTemplateStage,
  stageIndex: number,
  feedbackStates: Record<string, QcTemplateFeedbackState>,
) {
  const selection = (kind: PreviewKind, test?: QcTemplateTestItem): WorkbenchSelection => ({
    template: templateDetail,
    stage: stageDetail,
    stageIndex,
    kind,
    test,
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
  onToggle,
  onPreview,
  onFeedback,
}: StageRowsProps) {
  const tests = keyword ? stage.tests.filter((test) => testMatches(test, keyword)) : stage.tests;
  if (keyword && tests.length === 0 && !stage.label.toLowerCase().includes(keyword)) return null;
  const summary = stageFeedbackSummary(template, stage, index, feedbackStates);

  function select(kind: PreviewKind, test?: QcTemplateTestItem): WorkbenchSelection {
    return {
      template,
      stage,
      stageIndex: index,
      kind,
      test,
    };
  }

  function feedback(selection: WorkbenchSelection) {
    const context = feedbackContext(selection);
    onFeedback({ ...selection, context });
  }

  function feedbackState(selection: WorkbenchSelection) {
    return feedbackStates[feedbackKey(feedbackContext(selection))];
  }

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <button onClick={onToggle} className="flex w-full items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3 text-left">
        <span className="flex min-w-0 items-center gap-3">
          <h3 className="truncate text-sm font-semibold text-slate-900">{numerals[index] ?? index + 1}、{template.productName}{stage.label}</h3>
          <StageFeedbackBadge summary={summary} />
        </span>
        <span className="text-sm font-semibold text-slate-500">{expanded ? "收起" : "展开"} · {stage.tests.length} 个实验项目</span>
      </button>
      {expanded && (
        <div className="divide-y divide-slate-100">
          <TemplateRow
            badge="1"
            title="检验前确认"
            description="L1 模块 · YAML 文件清单 / 确认项 / 环境确认"
            feedbackState={feedbackState(select("precheck"))}
            onPreview={() => onPreview(select("precheck"))}
            onFeedback={() => feedback(select("precheck"))}
          />
          <TemplateRow
            badge="2"
            title="实验项目"
            description={`L1 模块 · ${stage.tests.length} 个项目`}
            feedbackState={feedbackState(select("experiment"))}
            onPreview={() => onPreview(select("experiment"))}
            onFeedback={() => feedback(select("experiment"))}
          />
          {tests.map((test) => (
            <TemplateRow
              key={test.englishName}
              badge={test.sequence}
              title={test.name}
              description={`${test.methodName || "未配置方法"} · ${test.layout?.templateId || "未映射组件"}`}
              inset
              feedbackState={feedbackState(select("test", test))}
              onPreview={() => onPreview(select("test", test))}
              onFeedback={() => feedback(select("test", test))}
            />
          ))}
        </div>
      )}
    </section>
  );
}
