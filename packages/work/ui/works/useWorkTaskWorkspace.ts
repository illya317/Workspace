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

export function useWorkTaskWorkspace({
  target,
  planId,
  onChanged,
}: {
  target: WorkTarget | null;
  planId: number | null;
  onChanged: () => Promise<void>;
}) {
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [createDraft, setCreateDraft] = useState<WorkItemDraft>(() => createEmptyWorkDraft());
  const [editDraft, setEditDraft] = useState<WorkItemDraft | null>(null);
  const { notify: showToast, confirmDelete } = useFeedback();
  const targetType = target?.targetType ?? null;
  const targetId = target?.targetId ?? null;
  const requestTarget = useMemo<WorkTarget | null>(
    () => targetType && targetId ? { targetType, targetId } : null,
    [targetId, targetType],
  );

  const reconcile = useCallback(async (options?: { silent?: boolean }) => {
    if (!requestTarget || !planId) {
      setWorks([]);
      if (!options?.silent) setLoading(false);
      return;
    }
    if (!options?.silent) setLoading(true);
    try {
      setWorks(await listWorkItems(requestTarget, planId));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "加载工作计划失败", "error");
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
      } catch (error) {
        if (!cancelled) showToast(error instanceof Error ? error.message : "加载工作计划失败", "error");
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
    () => works.find((work) => work.id === detailId) ?? works.find((work) => work.id === editingId) ?? null,
    [detailId, editingId, works],
  );

  const startCreate = useCallback((draft: WorkItemDraft) => {
    setEditingId(null);
    setDetailId(null);
    setEditDraft(null);
    setCreateDraft(draft);
    setCreating(true);
  }, []);

  const startEdit = useCallback((work: WorkItem) => {
    setEditingId(work.id);
    setDetailId(work.id);
    setCreating(false);
    setEditDraft(createWorkDraft(work));
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setDetailId(null);
    setEditDraft(null);
  }, []);

  async function create(options?: { feedback?: boolean; rethrow?: boolean }) {
    if (!requestTarget || !planId || saving) return;
    if (!createDraft.content.trim()) {
      showToast("节点内容不能为空", "error");
      return;
    }
    setSaving(true);
    try {
      const result = await createWorkItem(requestTarget, {
        ...createDraft,
        planId,
        sortOrder: createDraft.sortOrder || nextSortOrder(works),
      });
      setCreating(false);
      if (result.executionMode === "direct" || result.request.status === "approved") {
        await reconcile({ silent: true });
      }
      await onChanged();
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
    } catch (error) {
      if (options?.feedback !== false) showToast(error instanceof Error ? error.message : "新建节点失败", "error");
      if (options?.rethrow) throw error;
    } finally {
      setSaving(false);
    }
  }

  async function save() {
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
        await reconcile({ silent: true });
      }
      await onChanged();
      showToast(
        result.executionMode === "direct"
          ? "节点已保存"
          : result.request.status === "approved"
            ? "审批已完成，修改已生效"
            : "修改已提交审核",
        "success",
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : "保存节点失败", "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(work: WorkItem) {
    if (saving || !await confirmDelete({
      title: "删除节点",
      message: `确定删除「${work.content}」吗？`,
      confirmLabel: "删除节点",
    })) return;
    setSaving(true);
    try {
      await deleteWorkItem(work.id);
      closeWork(work.id);
      await Promise.all([reconcile({ silent: true }), onChanged()]);
      showToast("节点已删除", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "删除节点失败", "error");
    } finally {
      setSaving(false);
    }
  }

  async function archive(work: WorkItem) {
    if (saving || work.isArchived || !await confirmDelete({
      title: "归档任务",
      message: `确定归档「${work.content}」吗？归档后可通过“已归档”筛选查看。`,
      confirmLabel: "归档任务",
    })) return;
    setSaving(true);
    try {
      await archiveWorkItem(work.id);
      closeWork(work.id);
      await Promise.all([reconcile({ silent: true }), onChanged()]);
      showToast("任务已归档", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "归档任务失败", "error");
    } finally {
      setSaving(false);
    }
  }

  async function restore(work: WorkItem) {
    if (saving || !work.isArchived || !await confirmDelete({
      title: "恢复任务",
      message: `确定恢复「${work.content}」吗？恢复后回到归档前的任务状态。`,
      confirmLabel: "恢复任务",
    })) return;
    setSaving(true);
    try {
      await restoreWorkItem(work.id);
      closeWork(work.id);
      await Promise.all([reconcile({ silent: true }), onChanged()]);
      showToast("任务已恢复", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "恢复任务失败", "error");
    } finally {
      setSaving(false);
    }
  }

  function closeWork(workId: number) {
    if (detailId === workId) setDetailId(null);
    if (editingId === workId) setEditingId(null);
  }

  return {
    data: { works },
    selection: { activeWork, detailId, editingId },
    editor: { creating, createDraft, editDraft },
    status: { loading, saving },
    commands: {
      setCreating,
      setDetailId,
      setCreateDraft,
      setEditDraft,
      startCreate,
      startEdit,
      cancelEdit,
      create,
      save,
      remove,
      archive,
      restore,
      reconcile,
    },
  };
}

function nextSortOrder(works: WorkItem[]) {
  if (works.length === 0) return 10;
  return Math.max(...works.map((work) => work.sortOrder || 0)) + 10;
}
