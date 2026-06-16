"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  QcTemplateEditorTestDraft,
  QcTemplateModuleLibraryItem,
  QcTemplateStage,
} from "@/server/services/production/qc";
import type { NewTestInput } from "./editor-utils";
import TemplateModulePicker from "./TemplateModulePicker";

interface Props {
  templateId: string;
  stage: QcTemplateStage;
  tests: QcTemplateEditorTestDraft[];
  moduleLibrary: QcTemplateModuleLibraryItem[];
  onAddTest: (stage: QcTemplateStage, input: NewTestInput) => void;
  onMoveTest: (stage: QcTemplateStage, testId: string, direction: -1 | 1) => void;
  onUpdateTest: (stage: QcTemplateStage, testId: string, patch: Partial<QcTemplateEditorTestDraft>) => void;
  active?: boolean;
  onFocusStage?: (stage: QcTemplateStage) => void;
}

function initialKey(stage: QcTemplateStage, tests: QcTemplateEditorTestDraft[]) {
  return `custom_${stage.tests.length + tests.filter((test) => test.source === "draft").length + 1}`;
}

export default function TemplateLayoutStageCard({ templateId, stage, tests, moduleLibrary, onAddTest, onMoveTest, onUpdateTest, active = false, onFocusStage }: Props) {
  const moduleOptions = useMemo(() => moduleLibrary.filter((item) => item.id.startsWith("parents/") || item.blocks?.length), [moduleLibrary]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("新检测项");
  const [englishName, setEnglishName] = useState("");
  const [methodName, setMethodName] = useState("");
  const [templateModuleId, setTemplateModuleId] = useState("");

  function startAdd() {
    setAdding(true);
    setName("新检测项");
    setEnglishName(initialKey(stage, tests));
    setMethodName("");
    setTemplateModuleId("");
  }

  function submitAdd() {
    onAddTest(stage, { name, englishName, methodName, templateId: templateModuleId || undefined });
    setAdding(false);
  }

  return (
    <section className={`overflow-hidden rounded-lg border bg-white ${active ? "border-emerald-500 shadow-sm" : "border-slate-200"}`} onFocus={() => onFocusStage?.(stage)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <button onClick={() => onFocusStage?.(stage)} className="text-left text-base font-semibold text-slate-900 hover:text-emerald-800">{stage.label}</button>
          <p className="mt-1 text-xs text-slate-500">{stage.documentCount} 份文件 · {stage.precheckItemCount} 个确认项 · {tests.length} 个检测项</p>
        </div>
        <button onClick={startAdd} className="rounded-md border border-emerald-600 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">
          新增检测项
        </button>
      </div>

      <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          <span className="font-semibold">1 检验前确认</span>
          <span className="ml-3 text-xs text-slate-500">固定 L1，不在版面页编辑字段。</span>
        </div>
      </div>

      {adding && (
        <div className="border-b border-emerald-100 bg-emerald-50/40 px-4 py-3">
          <div className="grid gap-2 lg:grid-cols-[1fr_1fr_1fr_1.4fr_auto]">
            <input value={name} onChange={(event) => setName(event.target.value)} className="h-9 rounded-md border border-slate-300 px-2 text-sm" placeholder="项目名称" />
            <input value={methodName} onChange={(event) => setMethodName(event.target.value)} className="h-9 rounded-md border border-slate-300 px-2 text-sm" placeholder="方法" />
            <input value={englishName} onChange={(event) => setEnglishName(event.target.value)} className="h-9 rounded-md border border-slate-300 px-2 text-sm" placeholder="英文标识" />
            <TemplateModulePicker moduleLibrary={moduleOptions} value={templateModuleId} onChange={setTemplateModuleId} compact allowEmpty />
            <div className="flex gap-2">
              <button onClick={submitAdd} className="h-9 rounded-md border border-emerald-600 bg-white px-3 text-sm font-semibold text-emerald-800">添加</button>
              <button onClick={() => setAdding(false)} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-600">取消</button>
            </div>
          </div>
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {tests.map((test, index) => (
          <div key={`${stage.key}-${test.id}`} className="grid gap-3 px-4 py-3 xl:grid-cols-[120px_minmax(160px,0.8fr)_minmax(260px,1.4fr)_auto]">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{test.sequence || `2.${test.order}`}</span>
              <div className="grid gap-1">
                <button disabled={index === 0} onClick={() => onMoveTest(stage, test.id, -1)} className="h-6 rounded border border-slate-200 px-2 text-xs text-slate-600 disabled:opacity-30">上移</button>
                <button disabled={index === tests.length - 1} onClick={() => onMoveTest(stage, test.id, 1)} className="h-6 rounded border border-slate-200 px-2 text-xs text-slate-600 disabled:opacity-30">下移</button>
              </div>
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">{test.name}</div>
              <div className="mt-1 text-xs text-slate-500">默认 {test.defaultOrder || "-"} · 当前 {test.order} · {test.methodName || "未配置方法"}</div>
            </div>
            <TemplateModulePicker moduleLibrary={moduleOptions} value={test.templateId || ""} onChange={(templateIdValue) => onUpdateTest(stage, test.id, { templateId: templateIdValue || undefined })} compact allowEmpty />
            <Link href={`/production/qc/templates/${templateId}/edit/modules`} className="flex h-9 items-center justify-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              编辑模块
            </Link>
          </div>
        ))}
        {tests.length === 0 && <div className="px-4 py-10 text-center text-sm text-slate-500">暂无检测项。</div>}
      </div>
    </section>
  );
}
