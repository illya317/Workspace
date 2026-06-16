"use client";

import type { QcTemplateEditorData } from "@/server/services/production/qc";
import TemplateEditorModeNav from "./template-editor/TemplateEditorModeNav";
import TemplateLayoutStageCard from "./template-editor/TemplateLayoutStageCard";
import { useTemplateEditorDrafts } from "./template-editor/useTemplateEditorDrafts";

interface Props {
  data: QcTemplateEditorData;
}

export default function QcTemplateLayoutEditorClient({ data }: Props) {
  const editor = useTemplateEditorDrafts(data);

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-emerald-700">版面编辑器</p>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">{data.detail.productName}</h2>
            <p className="mt-1 text-sm text-slate-500">只维护检测项顺序和模块映射；表格结构、字段和公式在模块编辑器里维护。</p>
          </div>
          <div className="space-y-2 text-right">
            <TemplateEditorModeNav templateId={data.detail.id} active="layout" />
            <div className="text-xs text-slate-500">{data.detail.fileName}</div>
          </div>
        </div>
        {editor.saveError && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{editor.saveError}</div>}
      </div>

      <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="text-sm text-slate-600">{data.detail.stages.length} 个阶段 · {data.moduleLibrary.length} 个模块模板 · {data.drafts.length} 个已保存草稿</div>
        <div className="flex items-center gap-3">
          {editor.savedAt && <span className="text-xs text-slate-500">已保存：{editor.savedAt}</span>}
          <button onClick={editor.saveLayoutDrafts} disabled={editor.saving} className="h-9 rounded-md border border-emerald-600 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60">
            {editor.saving ? "保存中" : "保存版面草稿"}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {data.detail.stages.map((stage) => (
          <TemplateLayoutStageCard
            key={stage.key}
            templateId={data.detail.id}
            stage={stage}
            tests={editor.testsByStage[stage.key] || []}
            moduleLibrary={data.moduleLibrary}
            onAddTest={editor.addTest}
            onMoveTest={editor.moveTest}
            onUpdateTest={editor.updateTest}
          />
        ))}
      </div>
    </section>
  );
}
