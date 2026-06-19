import { useState, useEffect, useRef, useCallback } from "react";
import { useToast } from "@workspace/core/hooks";

interface UseInventoryTabOptions {
  apiBase: string;
  targetType: string;
  defaultOpType: string;
}

export function useInventoryTab({ apiBase, targetType, defaultOpType }: UseInventoryTabOptions) {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editingCell, setEditingCell] = useState<{ id: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast, showToast, closeToast } = useToast();

  const [showOp, setShowOp] = useState(false);
  const [opForm, setOpForm] = useState({
    opType: defaultOpType,
    targetId: 0,
    quantity: "",
    reason: "",
  });

  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<Record<string, unknown>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (keyword) params.set("keyword", keyword);
    const res = await fetch(`${apiBase}?${params.toString()}`);
    if (res.ok) setItems((await res.json()).items || []);
    setLoading(false);
  }, [keyword, apiBase]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  function startEdit(item: Record<string, unknown>, field: string) {
    if (!editMode) return;
    setEditingCell({ id: item.id as number, field });
    setEditValue(String(item[field] ?? ""));
  }

  async function saveEdit() {
    if (!editingCell) return;
    const res = await fetch(`${apiBase}/${editingCell.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: editingCell.field, value: editValue || null }),
    });
    if (res.ok) {
      showToast("保存成功");
      setEditingCell(null);
      load();
    } else showToast("保存失败", "error");
  }

  async function handleCreate() {
    const res = await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createForm),
    });
    if (res.ok) {
      showToast("创建成功");
      setCreating(false);
      setCreateForm({});
      load();
    } else {
      const err = await res.json().catch(() => ({ error: "创建失败" }));
      showToast(err.error, "error");
    }
  }

  async function handleDelete(id: number) {
    const res = await fetch(`${apiBase}/${id}`, { method: "DELETE" });
    if (res.ok) {
      showToast("删除成功");
      load();
    } else showToast("删除失败", "error");
  }

  async function handleOperation() {
    const res = await fetch("/workspace/api/inventory/operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...opForm,
        targetType,
        quantity: parseFloat(opForm.quantity),
      }),
    });
    if (res.ok) {
      showToast("操作成功");
      setShowOp(false);
      setOpForm({ opType: defaultOpType, targetId: 0, quantity: "", reason: "" });
      load();
    } else {
      const err = await res.json().catch(() => ({ error: "操作失败" }));
      showToast(err.error, "error");
    }
  }

  return {
    items, loading, keyword, setKeyword, editMode, setEditMode,
    editingCell, setEditingCell, editValue, setEditValue, inputRef,
    toast, showToast, closeToast,
    showOp, setShowOp, opForm, setOpForm,
    creating, setCreating, createForm, setCreateForm,
    load, startEdit, saveEdit, handleCreate, handleDelete, handleOperation,
  };
}
