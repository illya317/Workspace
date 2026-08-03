"use client";

import { workspacePath } from "@workspace/core/routing";
import { useFeedback } from "@workspace/core/ui";
import type {
  ConsolidationControlDecisionDraft,
  ConsolidationOverview,
  SaveConsolidationEntryInput,
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
    const detail = apiError(payload, fallback);
    const error = new Error(response.status === 409
      ? `${detail}；页面将刷新，请核对最新版本后重试`
      : detail);
    Object.assign(error, { status: response.status });
    throw error;
  }
  return payload;
}

export function useConsolidationCommands(
  data: ConsolidationOverview | null,
  onRefresh: (freshBatch?: NonNullable<ConsolidationOverview["batch"]>) => void,
  onBatchDeleted: () => void,
) {
  const feedback = useFeedback();
  const [busy, setBusy] = useState(false);

  type DraftBatch = NonNullable<ConsolidationOverview["batch"]>;
  type GenerationResult = {
    created: number;
    updated: number;
    unchanged: number;
    exceptions: number;
    sourceItems: number;
    batchRevision: number;
  };

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

  async function prepareAndGenerate(batch: DraftBatch) {
    const prepared = await request(
      `/api/modules/finance/statements/consolidation/batches/${batch.id}/sources`,
      "PUT",
      { expectedRevision: batch.revision, intent: "completePreparation" },
      "合并准备提交失败",
    ) as { batch?: DraftBatch };
    if (!prepared.batch) throw new Error("合并准备已提交，但服务器未返回最新批次");
    const generated = await request(
      `/api/modules/finance/statements/consolidation/batches/${prepared.batch.id}/entries/generate`,
      "POST",
      { expectedRevision: prepared.batch.revision },
      "抵销分录自动生成失败",
    ) as GenerationResult;
    return { batch: { ...prepared.batch, revision: generated.batchRevision }, generated };
  }

  async function buildWorkpaper(resolveBatch: () => Promise<DraftBatch>) {
    setBusy(true);
    try {
      const { batch: preparedBatch, generated } = await prepareAndGenerate(await resolveBatch());
      const voucherCount = generated.created + generated.updated + generated.unchanged;
      feedback.success(`已自动生成合并工作底稿和 ${voucherCount} 笔合并凭证${generated.exceptions > 0 ? `，${generated.exceptions} 项待核对` : ""}`);
      onRefresh(preparedBatch);
      return true;
    } catch (cause) {
      if (cause instanceof Error && "status" in cause && cause.status === 409) onRefresh();
      feedback.error(cause instanceof Error ? cause.message : "合并准备提交失败");
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
    return buildWorkpaper(async () => {
      const payload = await request(
        "/api/modules/finance/statements/consolidation/batches",
        "POST",
        {
          parentCompanyId: scope.parentCompanyId,
          year: scope.year,
          month: scope.month,
          periodKind: scope.periodKind,
        },
        "合并批次创建失败",
      ) as { batch?: DraftBatch };
      if (!payload.batch) throw new Error("合并批次创建成功，但服务器未返回批次");
      return payload.batch;
    });
  }

  async function completePreparation() {
    const batch = data?.batch;
    if (!batch) return false;
    return buildWorkpaper(async () => batch);
  }

  async function deleteBatch() {
    const batch = data?.batch;
    if (!batch || batch.status !== "draft") return false;
    const confirmed = await feedback.confirmDelete({
      title: "删除合并批次草稿",
      message: `将删除 ${data.scope.periodLabel} · V${batch.version} 草稿及其来源快照、抵销草稿和事件记录；删除后不可恢复。确定继续吗？`,
      confirmLabel: "删除草稿",
    });
    if (!confirmed) return false;
    setBusy(true);
    try {
      await request(
        `/api/modules/finance/statements/consolidation/batches/${batch.id}`,
        "DELETE",
        { expectedRevision: batch.revision, note: "期间、范围或来源存在错误，删除未完成草稿" },
        "合并批次草稿删除失败",
      );
      feedback.success("合并批次草稿已删除");
      onBatchDeleted();
      return true;
    } catch (cause) {
      feedback.error(cause instanceof Error ? cause.message : "合并批次草稿删除失败");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveDecision(input: ConsolidationControlDecisionDraft) {
    const batch = data?.batch;
    if (!batch) return false;
    return run(() => request(
      `/api/modules/finance/statements/consolidation/batches/${batch.id}/control-decisions`,
      "PUT",
      { ...input, expectedRevision: batch.revision },
      "控制结论保存失败",
    ), "人工判断已保存");
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

  async function reviewEntries(entryIds: number[], action: "approve" | "return", categoryLabel: string) {
    const batch = data?.batch;
    const uniqueEntryIds = [...new Set(entryIds)];
    if (!batch || uniqueEntryIds.length === 0) return false;
    const approved = action === "approve";
    setBusy(true);
    try {
      let expectedRevision = batch.revision;
      for (const entryId of uniqueEntryIds) {
        const payload = await request(
          `/api/modules/finance/statements/consolidation/batches/${batch.id}/entries/${entryId}/${action}`,
          "POST",
          {
            expectedRevision,
            note: approved
              ? `${categoryLabel}凭证明细与拟抵销分录整体核对一致`
              : `${categoryLabel}整体退回，重新核对来源凭证与拟抵销分录`,
          },
          approved ? `${categoryLabel}整体通过失败` : `${categoryLabel}整体退回失败`,
        ) as { batchRevision?: number };
        if (!payload.batchRevision) throw new Error(`${categoryLabel}审阅成功，但服务器未返回最新修订号`);
        expectedRevision = payload.batchRevision;
      }
      feedback.success(approved ? `${categoryLabel}已全部通过` : `${categoryLabel}已全部退回`);
      onRefresh();
      return true;
    } catch (cause) {
      if (cause instanceof Error && "status" in cause && cause.status === 409) onRefresh();
      feedback.error(cause instanceof Error ? cause.message : `${categoryLabel}整体审阅失败`);
      return false;
    } finally {
      setBusy(false);
    }
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

  async function advanceLifecycle() {
    const batch = data?.batch;
    if (!batch) return false;
    const action = nextConsolidationLifecycleAction(batch.status);
    if (!action) return false;
    const labels = {
      submit: "已提交复核",
      review: "已完成独立复核",
      lock: batch.status === "draft" ? "工作底稿已确认，合并报表已生成" : "已锁定批次",
      publish: "已发布合并报表",
    };
    return run(() => request(
      `/api/modules/finance/statements/consolidation/batches/${batch.id}/${action}`,
      "POST",
      { expectedRevision: batch.revision, note: null },
      `${labels[action]}失败`,
    ), labels[action]);
  }

  async function returnBatch(note: string) {
    const batch = data?.batch;
    const normalizedNote = note.trim();
    if (!batch || (batch.status !== "submitted" && batch.status !== "reviewed") || !normalizedNote) return false;
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
    ensureBatch,
    deleteBatch,
    completePreparation,
    saveDecision,
    saveEntry,
    reviewEntries,
    deleteEntry,
    saveTaxEffect,
    deleteTaxEffect,
    advanceLifecycle,
    returnBatch,
  };
}
