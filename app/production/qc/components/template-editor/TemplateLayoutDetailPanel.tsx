"use client";

import Link from "next/link";
import { useState } from "react";
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
  test?: QcTemplateEditorTestDraft;
  tests: QcTemplateEditorTestDraft[];
  moduleLibrary: QcTemplateModuleLibraryItem[];
  saving: boolean;
  savedAt?: string;
  onAddTest: (stage: QcTemplateStage, input: NewTestInput) => void;
  onMoveTest: (stage: QcTemplateStage, testId: string, direction: -1 | 1) => void;
  onUpdateTest: (stage: QcTemplateStage, testId: string, patch: Partial<QcTemplateEditorTestDraft>) => void;
  onPreview: () => void;
  onSave: () => void;
}

function nextKey(stage: QcTemplateStage, tests: QcTemplateEditorTestDraft[]) {
  return `custom_${stage.tests.length + tests.filter((item) => item.source === "draft").length + 1}`;
}

export default function TemplateLayoutDetailPanel({ templateId, stage, test, tests, moduleLibrary, saving, savedAt, onAddTest, onMoveTest, onUpdateTest, onPreview, onSave }: Props) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("新检测项");
  const [englishName, setEnglishName] = useState("");
  const [methodName, setMethodName] = useState("");
  const [templateModuleId, setTemplateModuleId] = useState("");
  const moduleOptions = moduleLibrary.filter((item) => item.id.startsWith("parents/") || item.blocks?.length);
  const index = test ? tests.findIndex((item) => item.id === test.id) : -1;

  function startAdd() {
    setAdding(true);
    setName("新检测项");
    setEnglishName(nextKey(stage, tests));
    setMethodName("");
    setTemplateModuleId("");
  }

  function submitAdd() {
    onAddTest(stage, { name, englishName, methodName, templateId: templateModuleId || undefined });
    setAdding(false);
  }

  return (
    <aside className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{test ? `${test.sequence || `2.${test.order}`} ${test.name}` : "检验前确认"}</h2>
            <p className="mt-1 text-xs text-slate-500">{stage.label}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={onPreview} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">预览</button>
            <button onClick={onSave} disabled={saving} className="h-9 rounded-md border border-emerald-600 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60">
              {saving ? "保存中" : "保存版面草稿"}
            </button>
          </div>
        </div>
        {savedAt && <div className="mt-2 text-xs text-slate-500">已保存：{savedAt}</div>}
      </section>

      {test ? (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">检测项配置</h2>
          <div className="grid gap-2 text-sm text-slate-600">
            <div>默认顺序：{test.defaultOrder || "-"}</div>
            <div>当前顺序：{test.order}</div>
            <div>方法：{test.methodName || "未配置"}</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button disabled={index <= 0} onClick={() => onMoveTest(stage, test.id, -1)} className="h-9 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">上移</button>
            <button disabled={index < 0 || index >= tests.length - 1} onClick={() => onMoveTest(stage, test.id, 1)} className="h-9 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">下移</button>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold text-slate-500">模块映射</div>
            <TemplateModulePicker moduleLibrary={moduleOptions} value={test.templateId || ""} onChange={(value) => onUpdateTest(stage, test.id, { templateId: value || undefined })} compact allowEmpty />
          </div>
          <Link href={`/production/qc/templates/${templateId}/edit/modules`} className="flex h-9 items-center justify-center rounded-md border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            去模块编辑器
          </Link>
        </section>
      ) : (
        <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          检验前确认是固定 L1。版面页只维护结构顺序和模块映射，确认项字段在模块编辑器或源配置中维护。
        </section>
      )}

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">新增检测项</h2>
          <button onClick={startAdd} className="rounded-md border border-emerald-600 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100">新建</button>
        </div>
        {adding && (
          <div className="space-y-2">
            <input value={name} onChange={(event) => setName(event.target.value)} className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm" placeholder="项目名称" />
            <input value={methodName} onChange={(event) => setMethodName(event.target.value)} className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm" placeholder="方法" />
            <input value={englishName} onChange={(event) => setEnglishName(event.target.value)} className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm" placeholder="英文标识" />
            <TemplateModulePicker moduleLibrary={moduleOptions} value={templateModuleId} onChange={setTemplateModuleId} compact allowEmpty />
            <div className="grid grid-cols-2 gap-2">
              <button onClick={submitAdd} className="h-9 rounded-md border border-emerald-600 bg-white text-sm font-semibold text-emerald-800">添加</button>
              <button onClick={() => setAdding(false)} className="h-9 rounded-md border border-slate-300 bg-white text-sm text-slate-600">取消</button>
            </div>
          </div>
        )}
      </section>
    </aside>
  );
}
