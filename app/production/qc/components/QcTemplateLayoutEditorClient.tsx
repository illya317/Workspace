"use client";

import { useState } from "react";
import type { QcTemplateEditorData, QcTemplateEditorTestDraft, QcTemplateStage } from "@/server/services/production/qc";
import TemplateEditorModeNav from "./template-editor/TemplateEditorModeNav";
import TemplateLayoutDetailPanel from "./template-editor/TemplateLayoutDetailPanel";
import TemplateLayoutOutline from "./template-editor/TemplateLayoutOutline";
import TemplatePreviewModal from "./template-editor/TemplatePreviewModal";
import { useTemplateEditorDrafts } from "./template-editor/useTemplateEditorDrafts";

interface Props {
  data: QcTemplateEditorData;
}

interface LayoutSelection {
  stageKey: string;
  nodeType: "precheck" | "test";
  testId?: string;
}

function firstSelection(data: QcTemplateEditorData): LayoutSelection {
  const stage = data.detail.stages[0];
  const test = stage?.tests[0];
  return { stageKey: stage?.key || "", nodeType: test ? "test" : "precheck", testId: test?.englishName };
}

export default function QcTemplateLayoutEditorClient({ data }: Props) {
  const editor = useTemplateEditorDrafts(data);
  const [selection, setSelection] = useState<LayoutSelection>(() => firstSelection(data));
  const [selectedBlockIndex, setSelectedBlockIndex] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const activeStage = data.detail.stages.find((stage) => stage.key === selection.stageKey) || data.detail.stages[0];
  const activeTests = activeStage ? editor.testsByStage[activeStage.key] || [] : [];
  const activeTest = selection.nodeType === "test" ? activeTests.find((test) => test.id === selection.testId || test.englishName === selection.testId) : undefined;
  const previewDraft = activeStage ? editor.layoutDraftForStage(activeStage) : null;
  const activeKey = activeStage ? selection.nodeType === "test" && activeTest ? `${activeStage.key}:test:${activeTest.id}` : `${activeStage.key}:precheck` : "";

  function selectPrecheck(stage: QcTemplateStage) {
    setSelection({ stageKey: stage.key, nodeType: "precheck" });
    setSelectedBlockIndex(0);
  }

  function selectTest(stage: QcTemplateStage, test: QcTemplateEditorTestDraft) {
    setSelection({ stageKey: stage.key, nodeType: "test", testId: test.id });
    setSelectedBlockIndex(0);
  }

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

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div className="text-sm text-slate-600">{data.detail.stages.length} 个阶段 · {data.moduleLibrary.length} 个模块模板 · {data.drafts.length} 个已保存草稿</div>
        {editor.savedAt && <span className="text-xs text-slate-500">已保存：{editor.savedAt}</span>}
      </div>

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <TemplateLayoutOutline detail={data.detail} testsByStage={editor.testsByStage} activeKey={activeKey} onSelectPrecheck={selectPrecheck} onSelectTest={selectTest} />
        {activeStage && (
          <TemplateLayoutDetailPanel
            templateId={data.detail.id}
            stage={activeStage}
            test={activeTest}
            tests={activeTests}
            moduleLibrary={data.moduleLibrary}
            saving={editor.saving}
            savedAt={editor.savedAt}
            onAddTest={editor.addTest}
            onMoveTest={editor.moveTest}
            onUpdateTest={editor.updateTest}
            onPreview={() => setPreviewOpen(true)}
            onSave={editor.saveLayoutDrafts}
          />
        )}
      </div>
      {previewDraft && (
        <TemplatePreviewModal draft={previewDraft} open={previewOpen} selectedBlockIndex={selectedBlockIndex} errors={[]} onSelectBlock={setSelectedBlockIndex} onClose={() => setPreviewOpen(false)} />
      )}
    </section>
  );
}
