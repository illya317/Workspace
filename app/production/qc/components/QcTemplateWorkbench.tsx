"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { QcTemplateDetail, QcTemplateStage, QcTemplateTestItem } from "@/server/services/production/qc";

interface Props {
  templates: QcTemplateDetail[];
}

const numerals = ["一", "二", "三", "四", "五", "六"];

function testMatches(test: QcTemplateTestItem, keyword: string) {
  return [test.sequence, test.name, test.englishName, test.methodName, test.layout?.templateId]
    .some((value) => (value ?? "").toLowerCase().includes(keyword));
}

function StageRows({ template, stage, index, keyword }: { template: QcTemplateDetail; stage: QcTemplateStage; index: number; keyword: string }) {
  const tests = keyword ? stage.tests.filter((test) => testMatches(test, keyword)) : stage.tests;
  if (keyword && tests.length === 0 && !stage.label.toLowerCase().includes(keyword)) return null;

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">{numerals[index] ?? index + 1}、{template.productName}{stage.label}</h3>
        <div className="text-sm font-semibold text-slate-500">{stage.tests.length} 个实验项目</div>
      </div>
      <div className="divide-y divide-slate-100">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-start gap-3">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">1</span>
            <div>
              <div className="font-semibold text-slate-900">检验前确认</div>
              <div className="mt-1 text-xs text-slate-500">YAML 文件清单 / 确认项 / 环境确认</div>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href={`/production/qc/templates/${template.id}`} className="rounded-md border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-700">反馈</Link>
            <Link href={`/production/qc/templates/${template.id}`} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">预览</Link>
          </div>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-start gap-3">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">2</span>
            <div>
              <div className="font-semibold text-slate-900">实验项目</div>
              <div className="mt-1 text-xs text-slate-500">L1 模块 · {stage.tests.length} 个项目</div>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href={`/production/qc/templates/${template.id}`} className="rounded-md border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-700">反馈</Link>
            <Link href={`/production/qc/templates/${template.id}`} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">预览</Link>
          </div>
        </div>
        {tests.map((test) => (
          <div key={test.englishName} className="flex items-center justify-between px-8 py-3">
            <div className="flex items-start gap-3">
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{test.sequence}</span>
              <div>
                <div className="font-semibold text-slate-900">{test.name}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {test.methodName || "未配置方法"} · {test.layout?.templateId || "未映射组件"}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Link href={`/production/qc/templates/${template.id}`} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">反馈</Link>
              <Link href={`/production/qc/templates/${template.id}`} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">预览</Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function QcTemplateWorkbench({ templates }: Props) {
  const [query, setQuery] = useState("");
  const keyword = query.trim().toLowerCase();
  const visibleTemplates = useMemo(() => templates.filter((template) => {
    if (!keyword) return true;
    return [template.productName, template.id].some((value) => value.toLowerCase().includes(keyword))
      || template.stages.some((stage) => stage.label.toLowerCase().includes(keyword) || stage.tests.some((test) => testMatches(test, keyword)));
  }), [keyword, templates]);

  return (
    <section className="space-y-5">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="搜索产品、阶段、项目"
        className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-600"
      />

      {visibleTemplates.map((template) => {
        const itemCount = template.stages.reduce((sum, stage) => sum + stage.tests.length, 0);
        return (
          <article key={template.id} className="space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">{template.productName}</h2>
                <div className="mt-1 text-xs text-slate-500">{template.id}</div>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{itemCount} 个实验项目</span>
            </div>
            {template.stages.map((stage, index) => (
              <StageRows key={stage.key} template={template} stage={stage} index={index} keyword={keyword} />
            ))}
          </article>
        );
      })}

      {visibleTemplates.length === 0 && (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">没有匹配的模板。</div>
      )}
    </section>
  );
}
