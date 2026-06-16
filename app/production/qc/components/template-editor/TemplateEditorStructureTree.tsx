"use client";

import { useMemo, useState } from "react";
import type {
  QcTemplateDetail,
  QcTemplateEditorNodeType,
  QcTemplateEditorTestDraft,
  QcTemplateModuleLibraryItem,
  QcTemplateStage,
  QcTemplateTestItem,
} from "@/server/services/production/qc";
import { draftId, targetFromNode, type NewTestInput } from "./editor-utils";
import TemplateModulePicker from "./TemplateModulePicker";

interface Props {
  detail: QcTemplateDetail;
  selectedId: string;
  testsByStage: Record<string, QcTemplateEditorTestDraft[]>;
  moduleLibrary: QcTemplateModuleLibraryItem[];
  onClose?: () => void;
  onSelect: (stage: QcTemplateStage, nodeType: QcTemplateEditorNodeType, test?: QcTemplateTestItem) => void;
  onSelectTest: (stage: QcTemplateStage, test: QcTemplateEditorTestDraft) => void;
  onAddTest: (stage: QcTemplateStage, input: NewTestInput) => void;
  onMoveTest: (stage: QcTemplateStage, testId: string, direction: -1 | 1) => void;
  layoutActions?: boolean;
}

function nodeClass(active: boolean, inset = false) {
  return `w-full rounded-md border px-3 py-2 text-left text-sm ${inset ? "ml-4 w-[calc(100%-1rem)]" : ""} ${
    active ? "border-emerald-600 bg-emerald-50 font-semibold text-emerald-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
  }`;
}

function initialKey(stage: QcTemplateStage) {
  return `custom_${stage.tests.length + 1}`;
}

export default function TemplateEditorStructureTree({ detail, selectedId, testsByStage, moduleLibrary, onClose, onSelect, onSelectTest, onAddTest, onMoveTest, layoutActions = true }: Props) {
  const templateOptions = useMemo(() => moduleLibrary.filter((item) => item.id.startsWith("parents/") || item.blocks?.length).slice(0, 120), [moduleLibrary]);
  const [addingStageKey, setAddingStageKey] = useState("");
  const [name, setName] = useState("新检测项");
  const [englishName, setEnglishName] = useState("");
  const [methodName, setMethodName] = useState("");
  const [templateId, setTemplateId] = useState("");

  function startAdd(stage: QcTemplateStage) {
    setAddingStageKey(stage.key);
    setName("新检测项");
    setEnglishName(initialKey(stage));
    setMethodName("");
    setTemplateId(templateOptions[0]?.id || "");
  }

  function submitAdd(stage: QcTemplateStage) {
    onAddTest(stage, { name, englishName, methodName, templateId: templateId || undefined });
    setAddingStageKey("");
  }

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
              ["experiment", "2 实验项目", `${(testsByStage[stage.key] || []).length} 个检测项`],
            ] as const).map(([nodeType, title, desc]) => {
              const id = draftId(targetFromNode(detail, stage, nodeType));
              return (
                <button key={nodeType} onClick={() => onSelect(stage, nodeType)} className={nodeClass(selectedId === id)}>
                  <span className="block">{title}</span>
                  <span className="mt-1 block text-xs font-normal opacity-70">{desc}</span>
                </button>
              );
            })}
            {layoutActions && (
              <div className="ml-4">
                <button onClick={() => startAdd(stage)} className="w-full rounded-md border border-dashed border-emerald-300 bg-emerald-50/60 px-3 py-2 text-left text-xs font-semibold text-emerald-800 hover:bg-emerald-50">
                  + 检测项
                </button>
              </div>
            )}
            {layoutActions && addingStageKey === stage.key && (
              <div className="ml-4 space-y-2 rounded-md border border-emerald-200 bg-emerald-50/40 p-2">
                <input value={name} onChange={(event) => setName(event.target.value)} className="h-8 w-full rounded border border-slate-300 px-2 text-xs" placeholder="项目名称" />
                <input value={methodName} onChange={(event) => setMethodName(event.target.value)} className="h-8 w-full rounded border border-slate-300 px-2 text-xs" placeholder="方法，例如 HPLC" />
                <input value={englishName} onChange={(event) => setEnglishName(event.target.value)} className="h-8 w-full rounded border border-slate-300 px-2 text-xs" placeholder="英文标识" />
                <TemplateModulePicker moduleLibrary={templateOptions} value={templateId} onChange={setTemplateId} compact />
                <div className="flex gap-2">
                  <button onClick={() => submitAdd(stage)} className="h-8 flex-1 rounded border border-emerald-600 bg-white text-xs font-semibold text-emerald-800">添加</button>
                  <button onClick={() => setAddingStageKey("")} className="h-8 flex-1 rounded border border-slate-300 bg-white text-xs text-slate-600">取消</button>
                </div>
              </div>
            )}
            {(testsByStage[stage.key] || []).map((test, index, tests) => {
              const id = draftId({ productKey: detail.id, stageKey: stage.key, nodeType: "test", testNameEn: test.englishName });
              return (
                <div key={`${stage.key}-${test.englishName}`} className="ml-4 flex gap-1">
                  <button onClick={() => onSelectTest(stage, test)} className={nodeClass(selectedId === id)}>
                    <span className="block truncate">{test.sequence || `2.${test.order}`} {test.name}</span>
                    <span className="mt-1 block truncate text-xs font-normal opacity-70">{test.methodName || "未配置"} · {test.templateId || "未映射组件"}</span>
                    <span className="mt-1 block text-[11px] font-normal opacity-70">默认 {test.defaultOrder || "-"} · 当前 {test.order}{test.source === "draft" ? " · 新增" : ""}</span>
                  </button>
                  {layoutActions && (
                    <div className="grid w-10 shrink-0 gap-1">
                      <button disabled={index === 0} onClick={() => onMoveTest(stage, test.id, -1)} className="rounded border border-slate-200 text-xs text-slate-600 disabled:opacity-30">↑</button>
                      <button disabled={index === tests.length - 1} onClick={() => onMoveTest(stage, test.id, 1)} className="rounded border border-slate-200 text-xs text-slate-600 disabled:opacity-30">↓</button>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </aside>
  );
}
