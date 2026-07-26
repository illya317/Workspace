"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFeedback } from "@workspace/core/ui";
import {
  archiveWorkItem,
  createWorkItem,
  deleteWorkItem,
  listWorkItems,
  restoreWorkItem,
  updateWorkItem,
} from "./api";
import { createEmptyWorkDraft, createWorkDraft } from "./model";
import type { WorkItem, WorkItemDraft, WorkTarget } from "./types";

export function useWorks(target: WorkTarget | null, planId: number | null) {
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [createDraft, setCreateDraft] = useState<WorkItemDraft>(() => createEmptyWorkDraft());
  const [editDraft, setEditDraft] = useState<WorkItemDraft | null>(null);
  const { notify: showToast } = useFeedback();
  const targetType = target?.targetType ?? null;
  const targetId = target?.targetId ?? null;
  const requestTarget = useMemo<WorkTarget | null>(
    () => targetType && targetId ? { targetType, targetId } : null,
    [targetId, targetType],
  );

  const loadWorks = useCallback(async (options?: { silent?: boolean }) => {
    if (!requestTarget || !planId) {
      setWorks([]);
      if (!options?.silent) setLoading(false);
      return;
    }
    if (!options?.silent) setLoading(true);
    try {
      setWorks(await listWorkItems(requestTarget, planId));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "加载工作计划失败", "error");
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [planId, requestTarget, showToast]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!requestTarget || !planId) {
        setWorks([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const nextWorks = await listWorkItems(requestTarget, planId);
        if (!cancelled) setWorks(nextWorks);
      } catch (err) {
        if (!cancelled) showToast(err instanceof Error ? err.message : "加载工作计划失败", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => { cancelled = true; };
  }, [planId, requestTarget, showToast]);

  useEffect(() => {
    setCreating(false);
    setEditingId(null);
    setDetailId(null);
    setEditDraft(null);
  }, [planId, targetId, targetType]);

  useEffect(() => {
    setCreateDraft(createEmptyWorkDraft(0, planId));
  }, [planId, targetId, targetType]);

  const activeWork = useMemo(
    () => works.find((work) => work.id === detailId) || works.find((work) => work.id === editingId) || null,
    [detailId, editingId, works],
  );

  function startEdit(work: WorkItem) {
    setEditingId(work.id);
    setDetailId(work.id);
    setCreating(false);
    setEditDraft(createWorkDraft(work));
  }

  async function handleCreate(options?: { feedback?: boolean; rethrow?: boolean }) {
    if (!requestTarget || !planId || saving) return;
    if (!createDraft.content.trim()) {
      showToast("节点内容不能为空", "error");
      return;
    }
    setSaving(true);
    try {
      const result = await createWorkItem(requestTarget, { ...createDraft, planId, sortOrder: createDraft.sortOrder || nextSortOrder(works) });
      setCreating(false);
      if (result.executionMode === "direct" || result.request.status === "approved") {
        await loadWorks({ silent: true });
      }
      if (options?.feedback !== false) {
        showToast(
          result.executionMode === "direct"
            ? "节点已新建"
            : result.request.status === "approved"
              ? "审批已完成，节点已生效"
              : "节点已提交审核",
          "success",
        );
      }
    } catch (err) {
      if (options?.feedback !== false) showToast(err instanceof Error ? err.message : "新建节点失败", "error");
      if (options?.rethrow) throw err;
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!editingId || !editDraft || saving) return;
    if (!editDraft.content.trim()) {
      showToast("节点内容不能为空", "error");
      return;
    }
    setSaving(true);
    try {
      const result = await updateWorkItem(editingId, editDraft);
      setEditingId(null);
      setEditDraft(null);
      if (result.executionMode === "direct" || result.request.status === "approved") {
        await loadWorks({ silent: true });
      }
      showToast(
        result.executionMode === "direct"
          ? "节点已保存"
          : result.request.status === "approved"
            ? "审批已完成，修改已生效"
            : "修改已提交审核",
        "success",
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存节点失败", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(work: WorkItem) {
    if (saving) return;
    setSaving(true);
    try {
      await deleteWorkItem(work.id);
      if (detailId === work.id) setDetailId(null);
      if (editingId === work.id) setEditingId(null);
      await loadWorks({ silent: true });
      showToast("节点已删除", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "删除节点失败", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(work: WorkItem) {
    if (saving || work.isArchived) return;
    setSaving(true);
    try {
      await archiveWorkItem(work.id);
      if (detailId === work.id) setDetailId(null);
      if (editingId === work.id) setEditingId(null);
      await loadWorks({ silent: true });
      showToast("任务已归档", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "归档任务失败", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleRestore(work: WorkItem) {
    if (saving || !work.isArchived) return;
    setSaving(true);
    try {
      await restoreWorkItem(work.id);
      if (detailId === work.id) setDetailId(null);
      if (editingId === work.id) setEditingId(null);
      await loadWorks({ silent: true });
      showToast("任务已恢复", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "恢复任务失败", "error");
    } finally {
      setSaving(false);
    }
  }

  return {
    works,
    loading,
    saving,
    creating,
    setCreating,
    editingId,
    detailId,
    setDetailId,
    createDraft,
    setCreateDraft,
    startCreate: (draft: WorkItemDraft) => {
      setEditingId(null);
      setDetailId(null);
      setEditDraft(null);
      setCreateDraft(draft);
      setCreating(true);
    },
    editDraft,
    setEditDraft,
    activeWork,
    showToast,
    loadWorks,
    startEdit,
    cancelEdit: () => {
      setEditingId(null);
      setDetailId(null);
      setEditDraft(null);
    },
    handleCreate,
    handleUpdate,
    handleArchive,
    handleRestore,
    handleDelete,
  };
}

function nextSortOrder(works: WorkItem[]) {
  if (works.length === 0) return 10;
  return Math.max(...works.map((work) => work.sortOrder || 0)) + 10;
}
