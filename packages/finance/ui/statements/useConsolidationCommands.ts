"use client";

import { workspacePath } from "@workspace/core/routing";
import { useFeedback } from "@workspace/core/ui";
import type {
  ConsolidationOverview,
  SaveConsolidationControlDecisionInput,
  SaveConsolidationEntryInput,
  SaveConsolidationSourcesInput,
  SaveConsolidationTaxEffectInput,
} from "@workspace/finance/types";
import { useState } from "react";

import { nextConsolidationLifecycleAction } from "./consolidation-workbench-model";

function apiError(payload: unknown, fallback: string) {
  return payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
    ? payload.error
    : fallback;
}

async function request(path: string, method: "DELETE" | "POST" | "PUT", body: unknown, fallback: string) {
  const response = await fetch(workspacePath(path), {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(response.status === 409
      ? "当前合并批次已被其他人更新，页面将刷新；请核对最新版本后重试"
      : apiError(payload, fallback));
    Object.assign(error, { status: response.status });
    throw error;
  }
  return payload;
}

export function useConsolidationCommands(
  data: ConsolidationOverview | null,
  onRefresh: () => void,
) {
  const feedback = useFeedback();
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      feedback.success(success);
      onRefresh();
      return true;
    } catch (cause) {
      if (cause instanceof Error && "status" in cause && cause.status === 409) onRefresh();
      feedback.error(cause instanceof Error ? cause.message : "合并处理失败");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function ensureBatch() {
    const scope = data?.scope;
    if (!scope?.parentCompanyId) {
      feedback.error("请先在公司关系中维护并表母子公司");
      return false;
    }
    return run(() => request(
      "/api/modules/finance/statements/consolidation/batches",
      "POST",
      { parentCompanyId: scope.parentCompanyId, year: scope.year, month: scope.month },
      "合并批次创建失败",
    ), "合并批次已创建，范围、来源和汇率将按批次版本冻结");
  }

  async function saveSources(input: Omit<SaveConsolidationSourcesInput, "expectedRevision">) {
    const batch = data?.batch;
    if (!batch) return false;
    return run(() => request(
      `/api/modules/finance/statements/consolidation/batches/${batch.id}/sources`,
      "PUT",
      { ...input, expectedRevision: batch.revision },
      "个别报表来源冻结失败",
    ), "个别三表、本位币与汇率应用已冻结到当前批次");
  }

  async function saveDecision(input: Omit<SaveConsolidationControlDecisionInput, "expectedRevision">) {
    const batch = data?.batch;
    if (!batch) return false;
    return run(() => request(
      `/api/modules/finance/statements/consolidation/batches/${batch.id}/control-decisions`,
      "PUT",
      { ...input, expectedRevision: batch.revision },
      "控制结论保存失败",
    ), "控制结论与证据已保存");
  }

  async function saveEntry(input: Omit<SaveConsolidationEntryInput, "expectedRevision">) {
    const batch = data?.batch;
    if (!batch) return false;
    return run(() => request(
      `/api/modules/finance/statements/consolidation/batches/${batch.id}/entries`,
      "POST",
      { ...input, expectedRevision: batch.revision },
      "抵销分录保存失败",
    ), "抵销分录草稿已保存");
  }

  async function saveTaxEffect(entryId: number, input: Omit<SaveConsolidationTaxEffectInput, "expectedRevision">) {
    const batch = data?.batch;
    if (!batch) return false;
    return run(() => request(
      `/api/modules/finance/statements/consolidation/batches/${batch.id}/entries/${entryId}/tax-effects`,
      "PUT",
      { ...input, expectedRevision: batch.revision },
      "税务影响保存失败",
    ), "税务影响已关联到抵销分录");
  }

  async function deleteEntry(entryId: number, note: string) {
    const batch = data?.batch;
    const normalizedNote = note.trim();
    if (!batch || !normalizedNote) return false;
    const confirmed = await feedback.confirmDelete({
      title: "删除抵销分录草稿",
      message: "删除后会保留批次事件和完整快照，但该草稿不再参与后续提交。确定继续吗？",
      confirmLabel: "删除草稿",
    });
    if (!confirmed) return false;
    return run(() => request(
      `/api/modules/finance/statements/consolidation/batches/${batch.id}/entries/${entryId}`,
      "DELETE",
      { expectedRevision: batch.revision, note: normalizedNote },
      "抵销分录删除失败",
    ), "抵销分录草稿已删除，审计快照已保留");
  }

  async function deleteTaxEffect(entryId: number, taxEffectId: number, note: string) {
    const batch = data?.batch;
    const normalizedNote = note.trim();
    if (!batch || !normalizedNote) return false;
    const confirmed = await feedback.confirmDelete({
      title: "删除税务影响草稿",
      message: "删除后会保留批次事件和完整快照。确定继续吗？",
      confirmLabel: "删除税效",
    });
    if (!confirmed) return false;
    return run(() => request(
      `/api/modules/finance/statements/consolidation/batches/${batch.id}/entries/${entryId}/tax-effects/${taxEffectId}`,
      "DELETE",
      { expectedRevision: batch.revision, note: normalizedNote },
      "税务影响删除失败",
    ), "税务影响草稿已删除，审计快照已保留");
  }

  async function reviewRate(rateId: number, note: string) {
    return run(() => request(
      `/api/modules/finance/statements/consolidation/exchange-rates/${rateId}/review`,
      "POST",
      { note },
      "汇率独立复核失败",
    ), "汇率证据已独立复核");
  }

  async function advanceLifecycle(note: string) {
    const batch = data?.batch;
    if (!batch) return false;
    const action = nextConsolidationLifecycleAction(batch.status);
    if (!action) return false;
    const labels = { submit: "已提交复核", review: "已完成独立复核", lock: "已锁定批次", publish: "已发布合并报表" };
    return run(() => request(
      `/api/modules/finance/statements/consolidation/batches/${batch.id}/${action}`,
      "POST",
      { expectedRevision: batch.revision, note: note.trim() || null },
      `${labels[action]}失败`,
    ), labels[action]);
  }

  async function returnBatch(note: string) {
    const batch = data?.batch;
    const normalizedNote = note.trim();
    if (!batch || batch.status !== "submitted" || !normalizedNote) return false;
    const confirmed = await feedback.confirm({
      title: "退回合并批次",
      message: "退回会将批次和已提交分录恢复为草稿，原提交事实仍保留在事件链中。确定继续吗？",
      confirmLabel: "退回修改",
      confirmDanger: true,
    });
    if (!confirmed) return false;
    return run(() => request(
      `/api/modules/finance/statements/consolidation/batches/${batch.id}/return`,
      "POST",
      { expectedRevision: batch.revision, note: normalizedNote },
      "合并批次退回失败",
    ), "合并批次已退回草稿");
  }

  return {
    busy,
    notifyError: (message: string) => feedback.error(message),
    ensureBatch,
    saveSources,
    saveDecision,
    saveEntry,
    deleteEntry,
    saveTaxEffect,
    deleteTaxEffect,
    reviewRate,
    advanceLifecycle,
    returnBatch,
  };
}
