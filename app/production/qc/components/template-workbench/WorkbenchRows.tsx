"use client";

import type { ReactNode } from "react";
import type { QcTemplateDetail, QcTemplateStage, QcTemplateTestItem } from "@/server/services/production/qc";
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
  feedbackSet: Set<string>;
  onToggle: () => void;
  onPreview: (selection: WorkbenchSelection) => void;
  onFeedback: (target: FeedbackTarget) => void;
}

export function testMatches(test: QcTemplateTestItem, keyword: string) {
  return [test.sequence, test.name, test.englishName, test.methodName, test.layout?.templateId]
    .some((value) => (value ?? "").toLowerCase().includes(keyword));
}

function ActionButton({ active, children, onClick }: { active?: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`h-9 rounded-md border px-3 text-xs font-semibold ${active ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
    >
      {active && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-700 align-middle" />}
      {children}
    </button>
  );
}

function TemplateRow({
  badge,
  title,
  description,
  inset,
  active,
  onPreview,
  onFeedback,
}: {
  badge: string;
  title: string;
  description: string;
  inset?: boolean;
  active?: boolean;
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
        <ActionButton active={active} onClick={onFeedback}>反馈</ActionButton>
        <ActionButton onClick={onPreview}>预览</ActionButton>
      </div>
    </div>
  );
}

export default function StageRows({
  template,
  stage,
  index,
  keyword,
  expanded,
  feedbackSet,
  onToggle,
  onPreview,
  onFeedback,
}: StageRowsProps) {
  const tests = keyword ? stage.tests.filter((test) => testMatches(test, keyword)) : stage.tests;
  if (keyword && tests.length === 0 && !stage.label.toLowerCase().includes(keyword)) return null;

  function select(kind: PreviewKind, test?: QcTemplateTestItem): WorkbenchSelection {
    return { template, stage, stageIndex: index, kind, test };
  }

  function feedback(selection: WorkbenchSelection) {
    const context = feedbackContext(selection);
    onFeedback({ ...selection, context });
  }

  function hasFeedback(selection: WorkbenchSelection) {
    return feedbackSet.has(feedbackKey(feedbackContext(selection)));
  }

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <button onClick={onToggle} className="flex w-full items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3 text-left">
        <h3 className="text-sm font-semibold text-slate-900">{numerals[index] ?? index + 1}、{template.productName}{stage.label}</h3>
        <span className="text-sm font-semibold text-slate-500">{expanded ? "收起" : "展开"} · {stage.tests.length} 个实验项目</span>
      </button>
      {expanded && (
        <div className="divide-y divide-slate-100">
          <TemplateRow
            badge="1"
            title="检验前确认"
            description="L1 模块 · YAML 文件清单 / 确认项 / 环境确认"
            active={hasFeedback(select("precheck"))}
            onPreview={() => onPreview(select("precheck"))}
            onFeedback={() => feedback(select("precheck"))}
          />
          <TemplateRow
            badge="2"
            title="实验项目"
            description={`L1 模块 · ${stage.tests.length} 个项目`}
            active={hasFeedback(select("experiment"))}
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
              active={hasFeedback(select("test", test))}
              onPreview={() => onPreview(select("test", test))}
              onFeedback={() => feedback(select("test", test))}
            />
          ))}
        </div>
      )}
    </section>
  );
}
