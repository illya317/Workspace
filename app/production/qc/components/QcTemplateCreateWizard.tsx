"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { QcTemplateDetail, QcTemplateStage } from "@/server/services/production/qc";

interface Props {
  templates: QcTemplateDetail[];
}

const expectedStages = [
  { key: "intermediate", label: "中间体" },
  { key: "packaging", label: "待包装品" },
  { key: "finished", label: "成品" },
];

const createModes = [
  { key: "copy", label: "复制现有模板", desc: "从该产品同阶段或相近产品复制 JSON/YAML 后进入草稿。" },
  { key: "blank", label: "空白新建", desc: "只建立产品与 L0 阶段骨架，后续逐步添加 L1/L2。" },
  { key: "raw", label: "RAW docx 辅助生成", desc: "从原始 Word 审计结果生成草稿，再人工确认。" },
];

function itemCount(template: QcTemplateDetail) {
  return template.stages.reduce((sum, stage) => sum + stage.tests.length, 0);
}

function stageSummary(stage?: QcTemplateStage) {
  if (!stage) return "尚未发现 record_templates 中的阶段配置";
  return `${stage.documentCount} 份文件 · ${stage.precheckItemCount} 个确认项 · ${stage.tests.length} 个实验项目`;
}

export default function QcTemplateCreateWizard({ templates }: Props) {
  const sortedTemplates = useMemo(
    () => [...templates].sort((a, b) => a.productName.localeCompare(b.productName, "zh-Hans-CN")),
    [templates],
  );
  const firstTemplateId = sortedTemplates[0]?.id ?? "";
  const [productId, setProductId] = useState(firstTemplateId);
  const [stageKey, setStageKey] = useState(expectedStages[0].key);
  const [mode, setMode] = useState(createModes[0].key);
  const selectedTemplate = sortedTemplates.find((template) => template.id === productId) ?? sortedTemplates[0];
  const selectedStage = selectedTemplate?.stages.find((stage) => stage.key === stageKey);
  const selectedStageLabel = expectedStages.find((stage) => stage.key === stageKey)?.label ?? stageKey;

  return (
    <section className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="mb-3 px-1">
          <h2 className="text-sm font-semibold text-slate-700">选择产品</h2>
          <p className="mt-1 text-xs text-slate-500">来自现有 record_templates YAML。</p>
        </div>
        <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
          {sortedTemplates.map((template) => (
            <button
              key={template.id}
              onClick={() => {
                setProductId(template.id);
                const firstExisting = expectedStages.find((stage) => template.stages.some((item) => item.key === stage.key));
                setStageKey(firstExisting?.key ?? expectedStages[0].key);
              }}
              className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                selectedTemplate?.id === template.id
                  ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="truncate font-semibold">{template.productName}</span>
                <span className="shrink-0 text-xs font-semibold">{template.stages.length}/3</span>
              </div>
              <div className="mt-1 truncate text-xs opacity-75">{template.id} · {itemCount(template)} 个项目</div>
            </button>
          ))}
        </div>
      </aside>

      <div className="min-w-0 space-y-5">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-emerald-700">新建模板向导</p>
              <h2 className="mt-2 text-lg font-semibold text-slate-900">{selectedTemplate?.productName ?? "未选择产品"}</h2>
              <p className="mt-1 text-sm text-slate-500">先锁定产品与 L0 阶段，再进入 JSON/YAML 草稿编辑。</p>
            </div>
            <Link href="/production/qc/templates" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              返回模板列表
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">选择 L0 阶段</h2>
              <p className="mt-1 text-xs text-slate-500">阶段固定为中间体、待包装品、成品；状态由当前 YAML 自动推导。</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {expectedStages.map((expected) => {
              const existing = selectedTemplate?.stages.find((stage) => stage.key === expected.key);
              const active = stageKey === expected.key;
              return (
                <button
                  key={expected.key}
                  onClick={() => setStageKey(expected.key)}
                  className={`rounded-lg border p-4 text-left ${
                    active
                      ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-base font-semibold">{expected.label}</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${existing ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>
                      {existing ? "已发布" : "缺失"}
                    </span>
                  </div>
                  <p className="mt-3 min-h-10 text-xs leading-5 opacity-80">{stageSummary(existing)}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">选择创建方式</h2>
            <div className="mt-4 space-y-3">
              {createModes.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setMode(item.key)}
                  className={`flex w-full items-start gap-3 rounded-md border px-4 py-3 text-left ${
                    mode === item.key
                      ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                      : "border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className={`mt-1 h-3 w-3 rounded-full border ${mode === item.key ? "border-emerald-700 bg-emerald-700" : "border-slate-300"}`} />
                  <span>
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className="mt-1 block text-xs leading-5 opacity-75">{item.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">草稿摘要</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">产品</dt>
                <dd className="mt-1 font-semibold text-slate-900">{selectedTemplate?.productName ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">L0 阶段</dt>
                <dd className="mt-1 font-semibold text-slate-900">{selectedStageLabel}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">当前状态</dt>
                <dd className="mt-1 font-semibold text-slate-900">{selectedStage ? "可从已发布模板复制" : "可建立缺失阶段草稿"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">创建方式</dt>
                <dd className="mt-1 font-semibold text-slate-900">{createModes.find((item) => item.key === mode)?.label}</dd>
              </div>
            </dl>
            <button
              disabled
              className="mt-5 h-10 w-full rounded-md border border-slate-200 bg-slate-100 text-sm font-semibold text-slate-400"
              title="下一步将接入草稿存储和 JSON/YAML 编辑器"
            >
              创建草稿（待接入）
            </button>
            <p className="mt-3 text-xs leading-5 text-slate-500">第一版仅固定创建入口和阶段选择逻辑，不写入模板真源。</p>
          </div>
        </div>
      </div>
    </section>
  );
}
