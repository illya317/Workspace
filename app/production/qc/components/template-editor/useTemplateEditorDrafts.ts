"use client";

import { useMemo, useState } from "react";
import type {
  QcLayoutPart,
  QcTemplateDetail,
  QcTemplateEditorData,
  QcTemplateEditorDraft,
  QcTemplateEditorNodeType,
  QcTemplateEditorTestDraft,
  QcTemplateStage,
  QcTemplateTestItem,
} from "@/server/services/production/qc";
import { draftId, initialDraft, orderedTestDrafts, targetFromNode, testItemFromDraft, withExperimentTests, type NewTestInput } from "./editor-utils";

export interface EditorSelection {
  stage: QcTemplateStage;
  nodeType: QcTemplateEditorNodeType;
  test?: QcTemplateTestItem;
}

function firstNode(detail: QcTemplateDetail): EditorSelection | null {
  const stage = detail.stages[0];
  return stage ? { stage, nodeType: "precheck" } : null;
}

function cleanKey(value: string, fallback: string) {
  return (value.trim() || fallback).replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || fallback;
}

function uniqueTestKey(tests: QcTemplateEditorTestDraft[], raw: string) {
  const used = new Set(tests.map((test) => test.englishName));
  const base = cleanKey(raw, `custom_${tests.length + 1}`);
  let key = base, index = 2;
  while (used.has(key)) key = `${base}_${index++}`;
  return key;
}

function partField(part: QcLayoutPart) {
  return (part.type === "field" || part.type === "line") ? part.field : undefined;
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
        const field = partField(part);
        if (field && !fields.has(field)) errors.push(`字段不存在：${field}`);
      });
    }));
  });
  return errors;
}

export function useTemplateEditorDrafts(data: QcTemplateEditorData) {
  const [drafts, setDrafts] = useState(() => new Map(data.drafts.map((draft) => [draft.draftId, draft])));
  const [selection, setSelection] = useState<EditorSelection | null>(firstNode(data.detail));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const selectedId = selection ? draftId(targetFromNode(data.detail, selection.stage, selection.nodeType, selection.test)) : "";

  const experimentDraftForStage = (stage: QcTemplateStage) => {
    const id = draftId(targetFromNode(data.detail, stage, "experiment"));
    return drafts.get(id) || initialDraft(data.detail, stage, "experiment");
  };
  const draft = useMemo(() => {
    if (!selection) return null;
    return drafts.get(selectedId) || initialDraft(data.detail, selection.stage, selection.nodeType, selection.test);
  }, [data.detail, drafts, selectedId, selection]);
  const testsByStage = useMemo(() => Object.fromEntries(data.detail.stages.map((stage) => {
    const id = draftId(targetFromNode(data.detail, stage, "experiment"));
    const experimentDraft = drafts.get(id) || initialDraft(data.detail, stage, "experiment");
    return [stage.key, orderedTestDrafts(experimentDraft.layoutDraft.tests || [])];
  })) as Record<string, QcTemplateEditorTestDraft[]>, [data.detail, drafts]);

  function updateDraft(nextDraft: QcTemplateEditorDraft) {
    setDrafts((current) => new Map(current).set(nextDraft.draftId, nextDraft));
  }

  function selectNode(stage: QcTemplateStage, nodeType: QcTemplateEditorNodeType, test?: QcTemplateTestItem) {
    setSelection({ stage, nodeType, test });
    setSaveError(undefined);
  }

  function selectTestDraft(stage: QcTemplateStage, test: QcTemplateEditorTestDraft) {
    selectNode(stage, "test", testItemFromDraft(stage, test, data.moduleLibrary));
  }

  function updateExperimentTests(stage: QcTemplateStage, tests: QcTemplateEditorTestDraft[]) {
    updateDraft(withExperimentTests(experimentDraftForStage(stage), tests));
  }

  function moveTest(stage: QcTemplateStage, testId: string, direction: -1 | 1) {
    const tests = testsByStage[stage.key] || [], index = tests.findIndex((test) => test.id === testId), target = index + direction;
    if (index < 0 || target < 0 || target >= tests.length) return;
    const swapped = tests.slice();
    [swapped[index], swapped[target]] = [swapped[target], swapped[index]];
    const ordered = orderedTestDrafts(swapped);
    updateExperimentTests(stage, ordered);
    const selected = selection?.test && ordered.find((test) => test.englishName === selection.test?.englishName);
    if (selected) selectNode(stage, "test", testItemFromDraft(stage, selected, data.moduleLibrary));
  }

  function addTest(stage: QcTemplateStage, input: NewTestInput) {
    const tests = testsByStage[stage.key] || [], key = uniqueTestKey(tests, input.englishName);
    const created: QcTemplateEditorTestDraft = { id: key, name: input.name.trim() || "新检测项", englishName: key, methodName: input.methodName.trim() || "未配置", templateId: input.templateId, order: tests.length + 1, source: "draft" };
    const ordered = orderedTestDrafts([...tests, created]), savedTest = ordered.find((test) => test.id === key) || created;
    const item = testItemFromDraft(stage, savedTest, data.moduleLibrary), newDraft = initialDraft(data.detail, stage, "test", item);
    setDrafts((current) => {
      const next = new Map(current), experimentDraft = current.get(draftId(targetFromNode(data.detail, stage, "experiment"))) || initialDraft(data.detail, stage, "experiment");
      next.set(experimentDraft.draftId, withExperimentTests(experimentDraft, ordered));
      next.set(newDraft.draftId, { ...newDraft, sourceTemplateId: input.templateId });
      return next;
    });
    setSelection({ stage, nodeType: "test", test: item });
  }

  function updateTest(stage: QcTemplateStage, testId: string, patch: Partial<QcTemplateEditorTestDraft>) {
    const tests = testsByStage[stage.key] || [];
    const ordered = orderedTestDrafts(tests.map((test) => test.id === testId ? { ...test, ...patch } : test));
    updateExperimentTests(stage, ordered);
    const selected = selection?.test && ordered.find((test) => test.englishName === selection.test?.englishName);
    if (selected) selectNode(stage, "test", testItemFromDraft(stage, selected, data.moduleLibrary));
  }

  async function persistDrafts(items: QcTemplateEditorDraft[]) {
    setSaving(true);
    setSaveError(undefined);
    try {
      const queue = new Map(items.map((item) => [item.draftId, item]));
      for (const item of queue.values()) {
        const response = await fetch(`/api/production/qc/template-editor/drafts/${encodeURIComponent(item.draftId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft: item }) });
        const payload = await response.json().catch(() => null) as { data?: QcTemplateEditorDraft; error?: string } | null;
        if (!response.ok || !payload?.data) throw new Error(payload?.error || "保存失败");
        updateDraft(payload.data);
      }
      setSavedAt(new Date().toLocaleString("zh-CN"));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    if (!draft) return;
    const items = selection ? [experimentDraftForStage(selection.stage), draft] : [draft];
    await persistDrafts(items);
  }

  async function saveLayoutDrafts() {
    await persistDrafts(data.detail.stages.map((stage) => experimentDraftForStage(stage)));
  }

  return { draft, selectedId, selection, testsByStage, errors: draft ? errorsForDraft(draft) : [], saving, savedAt, saveError, updateDraft, selectNode, selectTestDraft, addTest, updateTest, moveTest, saveDraft, saveLayoutDrafts };
}
