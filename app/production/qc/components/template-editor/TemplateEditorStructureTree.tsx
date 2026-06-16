"use client";

import type {
  QcTemplateDetail,
  QcTemplateEditorNodeType,
  QcTemplateStage,
  QcTemplateTestItem,
} from "@/server/services/production/qc";
import { draftId, targetFromNode } from "./editor-utils";

interface Props {
  detail: QcTemplateDetail;
  selectedId: string;
  onClose?: () => void;
  onSelect: (stage: QcTemplateStage, nodeType: QcTemplateEditorNodeType, test?: QcTemplateTestItem) => void;
}

function nodeClass(active: boolean, inset = false) {
  return `w-full rounded-md border px-3 py-2 text-left text-sm ${inset ? "ml-4 w-[calc(100%-1rem)]" : ""} ${
    active ? "border-emerald-600 bg-emerald-50 font-semibold text-emerald-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
  }`;
}

export default function TemplateEditorStructureTree({ detail, selectedId, onClose, onSelect }: Props) {
  return (
    <aside className="max-h-[calc(100vh-7rem)] overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
      <div className="mb-3 flex items-start justify-between gap-3 px-1">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">结构树</h2>
          <p className="mt-1 text-xs text-slate-500">只维护层级和顺序，标题编号自动计算。</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            隐藏
          </button>
        )}
      </div>
      <div className="space-y-3">
        {detail.stages.map((stage) => (
          <section key={stage.key} className="space-y-2">
            <div className="px-1 text-xs font-semibold text-slate-500">{stage.label}</div>
            {([
              ["precheck", "1 检验前确认", `${stage.documentCount} 份文件 · ${stage.precheckItemCount} 个确认项`],
              ["experiment", "2 实验项目", `${stage.tests.length} 个检测项`],
            ] as const).map(([nodeType, title, desc]) => {
              const id = draftId(targetFromNode(detail, stage, nodeType));
              return (
                <button key={nodeType} onClick={() => onSelect(stage, nodeType)} className={nodeClass(selectedId === id)}>
                  <span className="block">{title}</span>
                  <span className="mt-1 block text-xs font-normal opacity-70">{desc}</span>
                </button>
              );
            })}
            {stage.tests.map((test) => {
              const id = draftId(targetFromNode(detail, stage, "test", test));
              return (
                <button key={`${stage.key}-${test.englishName}`} onClick={() => onSelect(stage, "test", test)} className={nodeClass(selectedId === id, true)}>
                  <span className="block truncate">{test.sequence} {test.name}</span>
                  <span className="mt-1 block truncate text-xs font-normal opacity-70">{test.methodName || "未配置方法"} · {test.layout?.templateId || "未映射组件"}</span>
                </button>
              );
            })}
          </section>
        ))}
      </div>
    </aside>
  );
}
