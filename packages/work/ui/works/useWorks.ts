"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFeedback } from "@workspace/core/ui";
import {
  createWorkItem,
  deleteWorkItem,
  listWorkItems,
  updateWorkItem,
} from "./api";
import { createEmptyWorkDraft, createWorkDraft } from "./model";
import type { WorkItem, WorkItemDraft, WorkTarget } from "./types";

export function useWorks(target: WorkTarget | null) {
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [createDraft, setCreateDraft] = useState<WorkItemDraft>(() => createEmptyWorkDraft());
  const [editDraft, setEditDraft] = useState<WorkItemDraft | null>(null);
  const { notify: showToast } = useFeedback();

  const loadWorks = useCallback(async () => {
    if (!target) {
      setWorks([]);
      return;
    }
    setLoading(true);
    try {
      setWorks(await listWorkItems(target));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "加载工作计划失败", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast, target]);

  useEffect(() => { void loadWorks(); }, [loadWorks]);

  useEffect(() => {
    setCreating(false);
    setEditingId(null);
    setDetailId(null);
    setEditDraft(null);
  }, [target?.targetType, target?.targetId]);

  useEffect(() => {
    setCreateDraft(createEmptyWorkDraft(nextSortOrder(works)));
  }, [works]);

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

  async function handleCreate() {
    if (!target || saving) return;
    if (!createDraft.content.trim()) {
      showToast("工作内容不能为空", "error");
      return;
    }
    setSaving(true);
    try {
      await createWorkItem(target, { ...createDraft, sortOrder: createDraft.sortOrder || nextSortOrder(works) });
      setCreating(false);
      await loadWorks();
      showToast("工作项已新建", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "新建工作项失败", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!editingId || !editDraft || saving) return;
    if (!editDraft.content.trim()) {
      showToast("工作内容不能为空", "error");
      return;
    }
    setSaving(true);
    try {
      await updateWorkItem(editingId, editDraft);
      setEditingId(null);
      setEditDraft(null);
      await loadWorks();
      showToast("工作项已保存", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存工作项失败", "error");
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
      await loadWorks();
      showToast("工作项已删除", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "删除工作项失败", "error");
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
    editDraft,
    setEditDraft,
    activeWork,
    showToast,
    loadWorks,
    startEdit,
    cancelEdit: () => {
      setEditingId(null);
      setEditDraft(null);
    },
    handleCreate,
    handleUpdate,
    handleDelete,
  };
}

function nextSortOrder(works: WorkItem[]) {
  if (works.length === 0) return 10;
  return Math.max(...works.map((work) => work.sortOrder || 0)) + 10;
}
