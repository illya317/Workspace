"use client";

import { useState } from "react";
import type {
  QcTemplateEditorData,
  QcTemplateEditorNodeType,
  QcTemplateStage,
  QcTemplateTestItem,
} from "@/server/services/production/qc";
import TemplateEditorInspector from "./template-editor/TemplateEditorInspector";
import TemplateEditorPreviewPane from "./template-editor/TemplateEditorPreviewPane";
import TemplateEditorStructureTree from "./template-editor/TemplateEditorStructureTree";
import type { NewTestInput } from "./template-editor/editor-utils";
import { useTemplateEditorDrafts } from "./template-editor/useTemplateEditorDrafts";

interface Props {
  data: QcTemplateEditorData;
}

interface CellSelection { row: number; cell: number }

export default function QcTemplateEditorClient({ data }: Props) {
  const editor = useTemplateEditorDrafts(data);
  const [selectedBlockIndex, setSelectedBlockIndex] = useState(0);
  const [selectedCell, setSelectedCell] = useState<CellSelection | undefined>();
  const [structureOpen, setStructureOpen] = useState(false);
  const currentNodeLabel = editor.selection ? editor.selection.test
    ? `${editor.selection.stage.label} · ${editor.selection.test.sequence} ${editor.selection.test.name}`
    : `${editor.selection.stage.label} · ${editor.selection.nodeType === "precheck" ? "检验前确认" : "实验项目"}`
    : "未选择";

  function selectNode(stage: QcTemplateStage, nodeType: QcTemplateEditorNodeType, test?: QcTemplateTestItem) {
    editor.selectNode(stage, nodeType, test);
    setSelectedBlockIndex(0);
    setSelectedCell(undefined);
    setStructureOpen(false);
  }

  function addTest(stage: QcTemplateStage, input: NewTestInput) {
    editor.addTest(stage, input);
    setSelectedBlockIndex(0);
    setSelectedCell(undefined);
    setStructureOpen(false);
  }

  if (!editor.draft || !editor.selection) {
    return <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">没有可编辑的模板阶段。</div>;
  }

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-emerald-700">模板编辑器 V1</p>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">{data.detail.productName}</h2>
            <p className="mt-1 text-sm text-slate-500">草稿预览模式，不覆盖生产 JSON/YAML。</p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <div>{data.detail.fileName}</div>
            <div>{data.moduleLibrary.length} 个模块模板 · {data.drafts.length} 个已保存草稿</div>
          </div>
        </div>
        {editor.saveError && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{editor.saveError}</div>}
      </div>

      <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
        <button onClick={() => setStructureOpen(true)} className="rounded-md border border-emerald-600 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">
          结构
        </button>
        <div className="min-w-0 flex-1 truncate text-sm text-slate-600">{currentNodeLabel}</div>
      </div>

      {structureOpen && (
        <>
          <button aria-label="关闭结构树" className="fixed inset-0 z-30 cursor-default bg-slate-900/10" onClick={() => setStructureOpen(false)} />
          <div className="fixed left-4 top-24 z-40 w-[min(360px,calc(100vw-2rem))]">
            <TemplateEditorStructureTree
              detail={data.detail}
              selectedId={editor.selectedId}
              testsByStage={editor.testsByStage}
              moduleLibrary={data.moduleLibrary}
              onClose={() => setStructureOpen(false)}
              onSelect={selectNode}
              onSelectTest={(stage, test) => {
                editor.selectTestDraft(stage, test);
                setSelectedBlockIndex(0);
                setSelectedCell(undefined);
                setStructureOpen(false);
              }}
              onAddTest={addTest}
              onMoveTest={editor.moveTest}
            />
          </div>
        </>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <TemplateEditorPreviewPane draft={editor.draft} selectedBlockIndex={selectedBlockIndex} errors={editor.errors} onSelectBlock={(index) => {
          setSelectedBlockIndex(index);
          setSelectedCell(undefined);
        }} />
        <TemplateEditorInspector
          draft={editor.draft}
          selectedBlockIndex={selectedBlockIndex}
          selectedCell={selectedCell}
          moduleLibrary={data.moduleLibrary}
          fieldGroups={data.fieldGroups}
          formulaFunctions={data.formulaFunctions}
          onSelectBlock={setSelectedBlockIndex}
          onSelectCell={setSelectedCell}
          onChange={editor.updateDraft}
          onSave={editor.saveDraft}
          saving={editor.saving}
          savedAt={editor.savedAt}
        />
      </div>
    </section>
  );
}
