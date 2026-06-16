"use client";

import { useMemo, useState } from "react";
import type { QcTemplateEditorData, QcTemplateEditorDraft } from "@/server/services/production/qc";
import TemplateEditorInspector from "./template-editor/TemplateEditorInspector";
import TemplateEditorModeNav from "./template-editor/TemplateEditorModeNav";
import TemplateBlockOverview from "./template-editor/TemplateBlockOverview";
import TemplateModulePicker from "./template-editor/TemplateModulePicker";
import TemplatePreviewModal from "./template-editor/TemplatePreviewModal";
import { moduleDisplayName } from "./template-editor/editor-utils";
import { moduleDraftFromItem } from "./template-editor/module-draft-utils";

interface Props {
  data: QcTemplateEditorData;
}

interface CellSelection { row: number; cell: number }

export default function QcTemplateModuleEditorClient({ data }: Props) {
  const modules = useMemo(() => data.moduleLibrary.filter((item) => item.blocks?.length || item.id.startsWith("parents/")), [data.moduleLibrary]);
  const [drafts, setDrafts] = useState(() => new Map(data.drafts.filter((draft) => draft.nodeType === "module").map((draft) => [draft.draftId, draft])));
  const [moduleId, setModuleId] = useState(modules[0]?.id || "");
  const [selectedBlockIndex, setSelectedBlockIndex] = useState(0);
  const [selectedCell, setSelectedCell] = useState<CellSelection | undefined>();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const selectedModule = modules.find((item) => item.id === moduleId || item.templateId === moduleId) || modules[0];
  const fallbackDraft = selectedModule ? moduleDraftFromItem(data.detail, selectedModule) : null;
  const draft = fallbackDraft ? drafts.get(fallbackDraft.draftId) || fallbackDraft : null;

  function updateDraft(nextDraft: QcTemplateEditorDraft) {
    setDrafts((current) => new Map(current).set(nextDraft.draftId, nextDraft));
  }

  async function saveDraft() {
    if (!draft) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      const response = await fetch(`/api/production/qc/template-editor/drafts/${encodeURIComponent(draft.draftId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft }),
      });
      const payload = await response.json().catch(() => null) as { data?: QcTemplateEditorDraft; error?: string } | null;
      if (!response.ok || !payload?.data) throw new Error(payload?.error || "保存失败");
      updateDraft(payload.data);
      setSavedAt(new Date().toLocaleString("zh-CN"));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (!draft || !selectedModule) {
    return <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">没有可编辑的模块模板。</div>;
  }

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-emerald-700">模块编辑器</p>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">{moduleDisplayName(selectedModule)}</h2>
            <p className="mt-1 text-sm text-slate-500">先选择模块，再维护这个模块内部的表格结构、单元格、字段和公式。</p>
          </div>
          <div className="space-y-2 text-right">
            <TemplateEditorModeNav templateId={data.detail.id} active="module" />
            <div className="text-xs text-slate-500">{selectedModule.templateId}</div>
          </div>
        </div>
        {saveError && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{saveError}</div>}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <section className="sticky top-2 z-20 rounded-lg border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
            <div className="grid gap-3 lg:grid-cols-[minmax(260px,420px)_minmax(0,1fr)] lg:items-end">
              <TemplateModulePicker moduleLibrary={modules} value={moduleId} onChange={(nextId) => {
                setModuleId(nextId);
                setSelectedBlockIndex(0);
                setSelectedCell(undefined);
              }} compact />
              <div className="min-w-0 text-xs text-slate-500">
                <div className="font-semibold text-slate-700">{moduleDisplayName(selectedModule)}</div>
                <div className="mt-1 truncate">{selectedModule.id}</div>
              </div>
            </div>
          </section>
          <TemplateBlockOverview draft={draft} selectedBlockIndex={selectedBlockIndex} onSelectBlock={(index) => {
            setSelectedBlockIndex(index);
            setSelectedCell(undefined);
          }} />
        </div>

        <div className="space-y-3 xl:sticky xl:top-2 xl:self-start">
          <div className="flex items-center justify-end gap-3 rounded-lg border border-slate-200 bg-white p-3">
            {savedAt && <span className="text-xs text-slate-500">已保存：{savedAt}</span>}
            <button onClick={() => setPreviewOpen(true)} className="h-9 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              预览
            </button>
            <button onClick={saveDraft} disabled={saving} className="h-9 rounded-md border border-emerald-600 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60">
              {saving ? "保存中" : "保存模块草稿"}
            </button>
          </div>
          <TemplateEditorInspector
            draft={draft}
            selectedBlockIndex={selectedBlockIndex}
            selectedCell={selectedCell}
            moduleLibrary={data.moduleLibrary}
            fieldGroups={data.fieldGroups}
            formulaFunctions={data.formulaFunctions}
            onSelectBlock={setSelectedBlockIndex}
            onSelectCell={setSelectedCell}
            onChange={updateDraft}
            onSave={saveDraft}
            saving={saving}
            savedAt={savedAt}
          />
        </div>
      </div>
      <TemplatePreviewModal draft={draft} open={previewOpen} selectedBlockIndex={selectedBlockIndex} errors={[]} onSelectBlock={(index) => {
        setSelectedBlockIndex(index);
        setSelectedCell(undefined);
      }} onClose={() => setPreviewOpen(false)} />
    </section>
  );
}
