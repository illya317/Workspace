"use client";

import type {
  QcTemplateDetail,
  QcTemplateEditorTestDraft,
  QcTemplateStage,
} from "@/server/services/production/qc";

interface Props {
  detail: QcTemplateDetail;
  testsByStage: Record<string, QcTemplateEditorTestDraft[]>;
  activeKey: string;
  onSelectPrecheck: (stage: QcTemplateStage) => void;
  onSelectTest: (stage: QcTemplateStage, test: QcTemplateEditorTestDraft) => void;
}

function itemClass(active: boolean, inset = false) {
  return `w-full rounded-md border px-3 py-2 text-left text-sm ${inset ? "ml-4 w-[calc(100%-1rem)]" : ""} ${
    active ? "border-emerald-600 bg-emerald-50 font-semibold text-emerald-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
  }`;
}

export default function TemplateLayoutOutline({ detail, testsByStage, activeKey, onSelectPrecheck, onSelectTest }: Props) {
  return (
    <aside className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-3 px-1">
        <h2 className="text-sm font-semibold text-slate-900">版面结构</h2>
        <p className="mt-1 text-xs text-slate-500">最低颗粒度到检测项目。</p>
      </div>
      <div className="space-y-3">
        {detail.stages.map((stage) => (
          <section key={stage.key} className="space-y-2">
            <div className="px-1 text-xs font-semibold text-slate-500">{stage.label}</div>
            <button onClick={() => onSelectPrecheck(stage)} className={itemClass(activeKey === `${stage.key}:precheck`)}>
              <span className="block">1 检验前确认</span>
              <span className="mt-1 block text-xs font-normal opacity-70">{stage.documentCount} 份文件 · {stage.precheckItemCount} 个确认项</span>
            </button>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">
              2 实验项目
            </div>
            {(testsByStage[stage.key] || []).map((test) => {
              const key = `${stage.key}:test:${test.id}`;
              return (
                <button key={key} onClick={() => onSelectTest(stage, test)} className={itemClass(activeKey === key, true)}>
                  <span className="block truncate">{test.sequence || `2.${test.order}`} {test.name}</span>
                  <span className="mt-1 block truncate text-xs font-normal opacity-70">{test.methodName || "未配置"} · {test.templateId || "未映射组件"}</span>
                </button>
              );
            })}
          </section>
        ))}
      </div>
    </aside>
  );
}
