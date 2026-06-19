"use client";
import { useMemo, useRef, useState } from "react";
import type { QcTemplateDetail, QcTemplateFeedbackState } from "@workspace/production/server/qc";
import TemplateFeedbackModal from "./template-workbench/TemplateFeedbackModal";
import TemplatePreviewModal from "./template-workbench/TemplatePreviewModal";
import StageRows, { testMatches } from "./template-workbench/WorkbenchRows";
import type { FeedbackTarget, WorkbenchSelection } from "./template-workbench/types";

interface Props {
  templates: QcTemplateDetail[];
  feedbackStates: Record<string, QcTemplateFeedbackState>;
}

function templateMatches(template: QcTemplateDetail, keyword: string) {
  if (!keyword) return true;
  return [template.productName, template.id].some((value) => value.toLowerCase().includes(keyword))
    || template.stages.some((stage) => stage.label.toLowerCase().includes(keyword) || stage.tests.some((test) => testMatches(test, keyword)));
}

function itemCount(template: QcTemplateDetail) {
  return template.stages.reduce((sum, stage) => sum + stage.tests.length, 0);
}

export default function QcTemplateWorkbench({ templates, feedbackStates }: Props) {
  const [query, setQuery] = useState("");
  const [activeProduct, setActiveProduct] = useState("all");
  const [preview, setPreview] = useState<WorkbenchSelection | null>(null);
  const [previewLoading, setPreviewLoading] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [feedback, setFeedback] = useState<FeedbackTarget | null>(null);
  const [knownFeedbackStates, setKnownFeedbackStates] = useState(feedbackStates);
  const detailCache = useRef(new Map<string, QcTemplateDetail>());
  const firstStageKey = templates[0]?.stages[0] ? `${templates[0].id}:${templates[0].stages[0].key}` : "";
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set(firstStageKey ? [firstStageKey] : []));
  const keyword = query.trim().toLowerCase();
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

  function markFeedbackKeysOpen(keys: string[]) {
    setKnownFeedbackStates((current) => {
      const next = { ...current };
      for (const key of keys) {
        if (!next[key]) next[key] = "open";
      }
      return next;
    });
  }

  async function loadTemplateDetail(templateId: string) {
    const cached = detailCache.current.get(templateId);
    if (cached) return cached;
    const response = await fetch(`/workspace/api/production/qc/templates/${encodeURIComponent(templateId)}`);
    if (!response.ok) throw new Error("模板详情加载失败");
    const body = await response.json() as { data?: QcTemplateDetail };
    if (!body.data) throw new Error("模板详情为空");
    detailCache.current.set(templateId, body.data);
    return body.data;
  }

  async function openPreview(selection: WorkbenchSelection) {
    const loadingKey = `${selection.template.id}:${selection.stage.key}:${selection.kind}:${selection.test?.englishName || ""}`;
    setPreviewLoading(loadingKey);
    setPreviewError("");
    try {
      const detail = await loadTemplateDetail(selection.template.id);
      const stage = detail.stages.find((item) => item.key === selection.stage.key) || detail.stages[selection.stageIndex];
      const test = selection.test && stage?.tests.find((item) => item.englishName === selection.test?.englishName);
      if (!stage) throw new Error("模板阶段不存在");
      setPreview({ template: detail, stage, stageIndex: selection.stageIndex, kind: selection.kind, test });
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "模板详情加载失败");
    } finally {
      setPreviewLoading("");
    }
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
        <div className="flex flex-wrap gap-3">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索产品、阶段、项目" className="h-10 min-w-[260px] flex-1 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-600" />
        </div>
        {previewError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{previewError}</div>}
        {visibleTemplates.map((template) => (
          <article key={template.id} className="space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">{template.productName}</h2>
                <div className="mt-1 text-xs text-slate-500">{template.id}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{itemCount(template)} 个实验项目</span>
              </div>
            </div>
            {template.stages.map((stage, index) => (
              <StageRows
                key={stage.key}
                template={template}
                stage={stage}
                index={index}
                keyword={keyword}
                expanded={expandedStages.has(`${template.id}:${stage.key}`)}
                feedbackStates={knownFeedbackStates}
                previewLoadingKey={previewLoading}
                onToggle={() => toggleStage(template.id, stage.key)}
                onPreview={(selection) => { void openPreview(selection); }}
                onFeedback={setFeedback}
              />
            ))}
          </article>
        ))}
        {visibleTemplates.length === 0 && <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">没有匹配的模板。</div>}
      </div>
      <TemplatePreviewModal selection={preview} onClose={() => setPreview(null)} onSaved={markFeedbackKeysOpen} />
      <TemplateFeedbackModal target={feedback} onClose={() => setFeedback(null)} onSaved={setKnownFeedbackStates} />
    </section>
  );
}
