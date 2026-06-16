"use client";

import type { QcTemplateEditorDraft, QcTemplateEditorTestDraft, QcTemplateStage } from "@/server/services/production/qc";
import TemplateLayoutFlowView from "./TemplateLayoutFlowView";

interface Props {
  templateId: string;
  stage: QcTemplateStage;
  draft?: QcTemplateEditorDraft | null;
  test?: QcTemplateEditorTestDraft;
  saving: boolean;
  savedAt?: string;
  outlineOpen: boolean;
  onToggleOutline: () => void;
  summaryText: string;
  onPreview: () => void;
  onSave: () => void;
}

export default function TemplateLayoutDetailPanel({
  templateId: _templateId,
  stage,
  draft,
  test,
  saving,
  savedAt,
  outlineOpen,
  onToggleOutline,
  summaryText,
  onPreview,
  onSave,
}: Props) {
  return (
    <aside className="space-y-4">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={onToggleOutline}
                className="h-9 shrink-0 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {outlineOpen ? "隐藏结构" : "显示结构"}
              </button>
              <div className="truncate text-sm text-slate-600">{summaryText}</div>
            </div>
            {savedAt && <div className="shrink-0 text-xs text-slate-500">已保存：{savedAt}</div>}
          </div>

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">{test ? `${test.sequence || `2.${test.order}`} ${test.name}` : "1 检验前确认"}</h2>
              <p className="mt-1 text-sm text-slate-500">{stage.label}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={onPreview} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">预览</button>
              <button onClick={onSave} disabled={saving} className="h-9 rounded-md border border-emerald-600 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60">
                {saving ? "保存中" : "保存版面草稿"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {draft ? <TemplateLayoutFlowView draft={draft} stage={stage} test={test} /> : null}

    </aside>
  );
}
