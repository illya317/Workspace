"use client";

import { workspacePath } from "@workspace/core/routing";
import { TemplateWorkbenchFrame } from "@workspace/core/ui";
import type {
  QcTemplateDetail,
  QcTemplateFeedbackState,
} from "@workspace/production/server/qc";
import { useState } from "react";
import TemplateFeedbackModal from "./template-workbench/TemplateFeedbackModal";
import TemplatePreviewModal from "./template-workbench/TemplatePreviewModal";
import {
  createQcTemplateWorkbenchViewModel,
  previewKey,
} from "./template-workbench/qc-template-workbench-view-model";
import {
  type FeedbackTarget,
  type WorkbenchSelection,
} from "./template-workbench/types";

interface Props {
  templates: QcTemplateDetail[];
  feedbackStates: Record<string, QcTemplateFeedbackState>;
}

export default function QcTemplateWorkbench({ templates, feedbackStates }: Props) {
  const [preview, setPreview] = useState<WorkbenchSelection | null>(null);
  const [previewLoading, setPreviewLoading] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [feedback, setFeedback] = useState<FeedbackTarget | null>(null);
  const [knownFeedbackStates, setKnownFeedbackStates] = useState(feedbackStates);
  const [detailCache] = useState(() => new Map<string, QcTemplateDetail>());

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
    const cached = detailCache.get(templateId);
    if (cached) return cached;
    const response = await fetch(workspacePath(`/api/production/qc/templates/${encodeURIComponent(templateId)}`));
    if (!response.ok) throw new Error("模板详情加载失败");
    const body = await response.json() as { data?: QcTemplateDetail };
    if (!body.data) throw new Error("模板详情为空");
    detailCache.set(templateId, body.data);
    return body.data;
  }

  async function openPreview(selection: WorkbenchSelection) {
    const loadingKey = previewKey(selection);
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

  const viewModel = createQcTemplateWorkbenchViewModel({
    templates,
    feedbackStates: knownFeedbackStates,
    previewLoading,
    toolbarMeta: previewError ? <span className="text-red-600">{previewError}</span> : undefined,
    onPreview: (selection) => { void openPreview(selection); },
    onFeedback: setFeedback,
  });

  return (
    <section>
      <TemplateWorkbenchFrame {...viewModel} />
      <TemplatePreviewModal selection={preview} onClose={() => setPreview(null)} onSaved={markFeedbackKeysOpen} />
      <TemplateFeedbackModal target={feedback} onClose={() => setFeedback(null)} onSaved={setKnownFeedbackStates} />
    </section>
  );
}
