"use client";

import { useMemo, useState } from "react";
import type {
  QcTemplateDetail,
  QcTemplateEditorData,
  QcTemplateEditorDraft,
  QcTemplateEditorNodeType,
  QcTemplateStage,
  QcTemplateTestItem,
} from "@/server/services/production/qc";
import TemplateEditorInspector from "./template-editor/TemplateEditorInspector";
import TemplateEditorPreviewPane from "./template-editor/TemplateEditorPreviewPane";
import TemplateEditorStructureTree from "./template-editor/TemplateEditorStructureTree";
import { draftId, initialDraft, targetFromNode } from "./template-editor/editor-utils";

interface Props {
  data: QcTemplateEditorData;
}

interface CellSelection { row: number; cell: number }
interface EditorSelection {
  stage: QcTemplateStage;
  nodeType: QcTemplateEditorNodeType;
  test?: QcTemplateTestItem;
}

function firstNode(detail: QcTemplateDetail): EditorSelection | null {
  const stage = detail.stages[0];
  if (!stage) return null;
  return { stage, nodeType: "precheck" as QcTemplateEditorNodeType };
}

function errorsForDraft(draft: QcTemplateEditorDraft) {
  const errors: string[] = [];
  const fields = new Set(draft.methodDraft.methodGroups.flatMap((group) => group.fields.map((field) => field.name)));
  const roles = new Set(draft.layoutDraft.blocks.map((block) => block.sectionRole).filter(Boolean));
  draft.layoutDraft.blocks.forEach((block, blockIndex) => {
    if (block.sectionRef && !roles.has(block.sectionRef)) errors.push(`模块 ${blockIndex + 1} 的 sectionRef 未找到锚点：${block.sectionRef}`);
    if (JSON.stringify(block).includes("{FIELD:")) errors.push(`模块 ${blockIndex + 1} 仍包含 {FIELD} 占位符`);
    block.rows?.forEach((row, rowIndex) => row.forEach((cell, cellIndex) => {
      if (cell.colspan <= 0 || cell.rowspan <= 0) errors.push(`第 ${rowIndex + 1} 行第 ${cellIndex + 1} 格合并参数不合法`);
      cell.parts.forEach((part) => {
        if (part.type === "select" && !part.options?.length) errors.push(`第 ${rowIndex + 1} 行第 ${cellIndex + 1} 格下拉框缺少选项`);
        if ((part.type === "field" || part.type === "line") && part.field && !fields.has(part.field)) errors.push(`字段不存在：${part.field}`);
      });
    }));
  });
  return errors;
}

export default function QcTemplateEditorClient({ data }: Props) {
  const initialNode = firstNode(data.detail);
  const [drafts, setDrafts] = useState(() => new Map(data.drafts.map((draft) => [draft.draftId, draft])));
  const [selection, setSelection] = useState<EditorSelection | null>(initialNode);
  const [selectedBlockIndex, setSelectedBlockIndex] = useState(0);
  const [selectedCell, setSelectedCell] = useState<CellSelection | undefined>();
  const [structureOpen, setStructureOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string>();
  const [saveError, setSaveError] = useState<string>();

  const selectedTarget = selection ? targetFromNode(data.detail, selection.stage, selection.nodeType, selection.test) : null;
  const selectedId = selectedTarget ? draftId(selectedTarget) : "";
  const draft = useMemo(() => {
    if (!selection) return null;
    return drafts.get(selectedId) || initialDraft(data.detail, selection.stage, selection.nodeType, selection.test);
  }, [data.detail, drafts, selectedId, selection]);
  const errors = draft ? errorsForDraft(draft) : [];
  const currentNodeLabel = selection ? selection.test
    ? `${selection.stage.label} · ${selection.test.sequence} ${selection.test.name}`
    : `${selection.stage.label} · ${selection.nodeType === "precheck" ? "检验前确认" : "实验项目"}`
    : "未选择";

  function selectNode(stage: QcTemplateStage, nodeType: QcTemplateEditorNodeType, test?: QcTemplateTestItem) {
    setSelection({ stage, nodeType, test });
    setSelectedBlockIndex(0);
    setSelectedCell(undefined);
    setSaveError(undefined);
    setStructureOpen(false);
  }

  function updateDraft(nextDraft: QcTemplateEditorDraft) {
    setDrafts((current) => {
      const next = new Map(current);
      next.set(nextDraft.draftId, nextDraft);
      return next;
    });
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

  if (!draft || !selection) {
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
        {saveError && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{saveError}</div>}
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
            <TemplateEditorStructureTree detail={data.detail} selectedId={selectedId} onClose={() => setStructureOpen(false)} onSelect={selectNode} />
          </div>
        </>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <TemplateEditorPreviewPane draft={draft} selectedBlockIndex={selectedBlockIndex} errors={errors} onSelectBlock={(index) => {
          setSelectedBlockIndex(index);
          setSelectedCell(undefined);
        }} />
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
    </section>
  );
}
