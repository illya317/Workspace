"use client";

import { useMemo, useState } from "react";
import type { QcTemplateDetail } from "@/server/services/production/qc";
import TemplateFeedbackModal from "./template-workbench/TemplateFeedbackModal";
import TemplatePreviewModal from "./template-workbench/TemplatePreviewModal";
import StageRows, { testMatches } from "./template-workbench/WorkbenchRows";
import type { FeedbackTarget, WorkbenchSelection } from "./template-workbench/types";

interface Props {
  templates: QcTemplateDetail[];
  feedbackKeys: string[];
}

function templateMatches(template: QcTemplateDetail, keyword: string) {
  if (!keyword) return true;
  return [template.productName, template.id].some((value) => value.toLowerCase().includes(keyword))
    || template.stages.some((stage) => stage.label.toLowerCase().includes(keyword) || stage.tests.some((test) => testMatches(test, keyword)));
}

function itemCount(template: QcTemplateDetail) {
  return template.stages.reduce((sum, stage) => sum + stage.tests.length, 0);
}

export default function QcTemplateWorkbench({ templates, feedbackKeys }: Props) {
  const [query, setQuery] = useState("");
  const [activeProduct, setActiveProduct] = useState("all");
  const [preview, setPreview] = useState<WorkbenchSelection | null>(null);
  const [feedback, setFeedback] = useState<FeedbackTarget | null>(null);
  const [knownFeedbackKeys, setKnownFeedbackKeys] = useState(feedbackKeys);
  const firstStageKey = templates[0]?.stages[0] ? `${templates[0].id}:${templates[0].stages[0].key}` : "";
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set(firstStageKey ? [firstStageKey] : []));
  const keyword = query.trim().toLowerCase();
  const feedbackSet = useMemo(() => new Set(knownFeedbackKeys), [knownFeedbackKeys]);
  const visibleTemplates = useMemo(() => templates.filter((template) => {
    const productOk = activeProduct === "all" || template.id === activeProduct;
    return productOk && templateMatches(template, keyword);
  }), [activeProduct, keyword, templates]);

  function toggleStage(templateId: string, stageKey: string) {
    const key = `${templateId}:${stageKey}`;
    setExpandedStages((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="rounded-lg border border-slate-200 bg-white p-3">
        <h2 className="mb-3 px-1 text-sm font-semibold text-slate-700">产品</h2>
        <div className="space-y-2">
          <button onClick={() => setActiveProduct("all")} className={`flex w-full justify-between rounded-md border px-3 py-2 text-sm font-semibold ${activeProduct === "all" ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
            <span>全部产品</span><span>{templates.length}</span>
          </button>
          {templates.map((template) => (
            <button key={template.id} onClick={() => setActiveProduct(template.id)} className={`flex w-full justify-between rounded-md border px-3 py-2 text-sm ${activeProduct === template.id ? "border-emerald-600 bg-emerald-50 font-semibold text-emerald-800" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
              <span className="truncate">{template.productName}</span><span className="ml-3 font-semibold">{itemCount(template)}/{itemCount(template)}</span>
            </button>
          ))}
        </div>
      </aside>
      <div className="min-w-0 space-y-5">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索产品、阶段、项目" className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-600" />
        {visibleTemplates.map((template) => (
          <article key={template.id} className="space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">{template.productName}</h2>
                <div className="mt-1 text-xs text-slate-500">{template.id}</div>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{itemCount(template)} 个实验项目</span>
            </div>
            {template.stages.map((stage, index) => (
              <StageRows
                key={stage.key}
                template={template}
                stage={stage}
                index={index}
                keyword={keyword}
                expanded={expandedStages.has(`${template.id}:${stage.key}`)}
                feedbackSet={feedbackSet}
                onToggle={() => toggleStage(template.id, stage.key)}
                onPreview={setPreview}
                onFeedback={setFeedback}
              />
            ))}
          </article>
        ))}
        {visibleTemplates.length === 0 && <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">没有匹配的模板。</div>}
      </div>
      <TemplatePreviewModal selection={preview} onClose={() => setPreview(null)} />
      <TemplateFeedbackModal target={feedback} onClose={() => setFeedback(null)} onSaved={setKnownFeedbackKeys} />
    </section>
  );
}
