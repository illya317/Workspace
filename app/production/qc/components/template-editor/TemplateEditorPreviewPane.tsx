"use client";

import type { QcLayoutBlock, QcTemplateEditorDraft, QcTemplateTestItem } from "@/server/services/production/qc";
import QcLayoutPaper from "../QcLayoutPaper";
import { blockLabel } from "./editor-utils";

interface Props {
  draft: QcTemplateEditorDraft;
  selectedBlockIndex: number;
  errors: string[];
  onSelectBlock: (index: number) => void;
}

function previewTest(draft: QcTemplateEditorDraft): QcTemplateTestItem {
  const fallbackName = draft.nodeType === "module" ? "模块预览" : draft.nodeType === "precheck" ? "检验前确认" : "实验项目";
  return {
    sequence: draft.nodeType === "precheck" ? "1" : draft.nodeType === "module" ? "" : draft.sequence || "2",
    name: draft.testName || fallbackName,
    englishName: draft.testNameEn || draft.nodeType,
    methodName: "",
    hasNumericConclusion: false,
    methodGroups: draft.methodDraft.methodGroups,
  };
}

function blockTone(block: QcLayoutBlock) {
  if (block.type === "table") return "表格";
  if (block.type === "title") return "标题";
  if (block.type === "paragraph") return "段落";
  return block.type;
}

export default function TemplateEditorPreviewPane({ draft, selectedBlockIndex, errors, onSelectBlock }: Props) {
  return (
    <div className="min-w-0 space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">A4 预览</h2>
            <p className="mt-1 text-xs text-slate-500">{draft.stageLabel} · {draft.testName || (draft.nodeType === "precheck" ? "检验前确认" : "实验项目")}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${errors.length ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
            {errors.length ? `${errors.length} 个问题` : "可预览"}
          </span>
        </div>
        {errors.length > 0 && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700">
            {errors.slice(0, 4).map((error) => <div key={error}>{error}</div>)}
          </div>
        )}
        <div className="overflow-x-auto rounded-md bg-slate-100 p-5">
          <div className="mx-auto min-h-[600px] w-[210mm] bg-white px-[14mm] py-[16mm] shadow-sm">
            <QcLayoutPaper blocks={draft.layoutDraft.blocks} test={previewTest(draft)} />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-3">
        <h2 className="mb-3 px-1 text-sm font-semibold text-slate-700">模块</h2>
        <div className="grid gap-2 md:grid-cols-2">
          {draft.layoutDraft.blocks.map((block, index) => (
            <button
              key={`${block.type}-${index}`}
              onClick={() => onSelectBlock(index)}
              className={`rounded-md border px-3 py-2 text-left text-sm ${selectedBlockIndex === index ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
            >
              <span className="block truncate font-semibold">{index + 1}. {blockLabel(block, index)}</span>
              <span className="mt-1 block text-xs opacity-70">{blockTone(block)}</span>
            </button>
          ))}
          {draft.layoutDraft.blocks.length === 0 && <div className="rounded-md border border-slate-200 px-3 py-8 text-center text-sm text-slate-500">暂无模块，可从右侧添加标题或表格。</div>}
        </div>
      </section>
    </div>
  );
}
