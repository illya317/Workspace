"use client";

import { useState, useCallback } from "react";
import { useToast } from "@/app/hooks/useToast";
import type { WorkItem } from "./types";

export function useWorks() {
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingWork, setEditingWork] = useState<WorkItem | null>(null);

  const { toast, showToast, closeToast } = useToast();

  const fetchWorks = useCallback(async () => {
    const selectedDept = typeof window !== "undefined" ? localStorage.getItem("selectedDeptId") : null;
    const deptParam = selectedDept ? `&deptId=${selectedDept}` : "";
    const res = await fetch(`/workspace/api/works?includeArchived=true${deptParam}`);
    const data = await res.json();
    setWorks(data.works || []);
    setLoading(false);
  }, []);

  async function handleCreate(data: {
    category: string;
    content: string;
    importance: number;
    urgency: number;
    participants: string;
    sortOrder: number;
  }) {
    const selectedDept = typeof window !== "undefined" ? localStorage.getItem("selectedDeptId") : null;
    const body = selectedDept ? { ...data, deptId: parseInt(selectedDept) } : data;
    const res = await fetch("/workspace/api/works", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setShowForm(false);
      fetchWorks();
    } else {
      const err = await res.json();
      showToast(err.error || "添加失败", "error");
    }
  }

  async function handleUpdate(data: {
    category: string;
    content: string;
    importance: number;
    urgency: number;
    participants: string;
    sortOrder: number;
  }) {
    if (!editingWork) return;
    const res = await fetch(`/workspace/api/works/${editingWork.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setEditingWork(null);
      fetchWorks();
    } else {
      const err = await res.json();
      showToast(err.error || "更新失败", "error");
    }
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/workspace/api/works/${id}`, { method: "DELETE" });
    if (res.ok) {
      fetchWorks();
    } else {
      const err = await res.json();
      showToast(err.error || "删除失败", "error");
    }
  }

  async function handleArchive(id: number) {
    const res = await fetch(`/workspace/api/works/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isArchived: true }),
    });
    if (res.ok) fetchWorks();
    else { const err = await res.json(); showToast(err.error || "归档失败", "error"); }
  }

  async function handleRestore(id: number) {
    const res = await fetch(`/workspace/api/works/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isArchived: false }),
    });
    if (res.ok) fetchWorks();
    else { const err = await res.json(); showToast(err.error || "恢复失败", "error"); }
  }

  async function handleMove(id: number, direction: number) {
    const categoryWorks = works.filter(
      (w) => w.category === works.find((w) => w.id === id)?.category && !w.isArchived
    );
    const sorted = categoryWorks.sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((w) => w.id === id);
    const target = idx + direction;
    if (target < 0 || target >= sorted.length) return;

    const currentWork = sorted[idx];
    const targetWork = sorted[target];

    await Promise.all([
      fetch(`/workspace/api/works/${currentWork.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: targetWork.sortOrder }),
      }),
      fetch(`/workspace/api/works/${targetWork.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: currentWork.sortOrder }),
      }),
    ]);
    fetchWorks();
  }

  return {
    works,
    loading,
    showForm,
    setShowForm,
    editingWork,
    setEditingWork,
    toast,
    showToast,
    closeToast,
    fetchWorks,
    handleCreate,
    handleUpdate,
    handleDelete,
    handleArchive,
    handleRestore,
    handleMove,
  };
}
