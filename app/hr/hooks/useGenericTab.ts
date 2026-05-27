"use client";

import { useState, useCallback, useEffect } from "react";
import type { TabConfig } from "../types";

export interface GenericTabState {
  items: any[];
  loading: boolean;
  error: string | null;
  keyword: string;
  setKeyword: (v: string) => void;
  filters: Record<string, string>;
  setFilter: (key: string, value: string) => void;
  applyFilters: (next: Record<string, string>) => void;
  resetFilters: () => void;
  editMode: boolean;
  setEditMode: (v: boolean) => void;
  editingCell: { id: number; field: string } | null;
  editValue: any;
  setEditValue: (v: any) => void;
  startEdit: (id: number, field: string, initialValue: any) => void;
  cancelEdit: () => void;
  saveCell: () => Promise<boolean>;
  creating: boolean;
  setCreating: (v: boolean) => void;
  createForm: Record<string, unknown>;
  setCreateForm: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  submitCreate: () => Promise<boolean>;

  saving: boolean;
  load: () => Promise<void>;
  showHistory: boolean;
  setShowHistory: (v: boolean) => void;

  // 服务端分页
  page: number;
  pageSize: number;
  total: number;
  setPage: (v: number) => void;
}

export function useGenericTab(config: TabConfig): GenericTabState {
  const [rawItems, setRawItems] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    if (config.filters) {
      for (const f of config.filters) {
        if (f.defaultValue !== undefined) init[f.key] = f.defaultValue;
      }
    }
    return init;
  });
  const [editMode, setEditMode] = useState(false);
  const [editingCell, setEditingCell] = useState<{ id: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState<any>("");
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState(0);

  // 加载原始数据（keyword + filters + 分页）
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (keyword) params.set("keyword", keyword);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      for (const [key, value] of Object.entries(filters)) {
        if (value !== "" && value !== undefined && value !== null) {
          params.set(key, value);
        }
      }
      const res = await fetch(`${config.apiPath}?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const list = config.listGetter ? config.listGetter(data) : data.items || data;
        setRawItems(Array.isArray(list) ? list : []);
        setTotal(typeof data.total === "number" ? data.total : 0);
      } else {
        const data = await res.json().catch(() => ({ error: `请求失败 (${res.status})` }));
        setError(data.error || `请求失败 (${res.status})`);
        setRawItems([]);
        setTotal(0);
      }
    } catch (e: any) {
      setError(e.message || "网络错误");
      setRawItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [config, keyword, page, pageSize, filters]);

  useEffect(() => {
    load();
  }, [load]);

  // 前端不再筛选（已移至服务端），rawItems 即当前页 items
  useEffect(() => {
    setItems(rawItems);
  }, [rawItems]);

  const setFilter = useCallback((key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const applyFilters = useCallback((next: Record<string, string>) => {
    setFilters(next);
  }, []);

  const resetFilters = useCallback(() => {
    const init: Record<string, string> = {};
    if (config.filters) {
      for (const f of config.filters) {
        if (f.defaultValue !== undefined) init[f.key] = f.defaultValue;
      }
    }
    setFilters(init);
  }, [config.filters]);

  const startEdit = useCallback((id: number, field: string, initialValue: any) => {
    setEditingCell({ id, field });
    setEditValue(initialValue ?? "");
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue("");
  }, []);

  const saveCell = useCallback(async () => {
    if (!editingCell) return false;
    setSaving(true);
    try {
      const { id, field } = editingCell;
      const res = await fetch(`${config.apiPath}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value: editValue ?? null }),
      });
      if (res.ok) {
        let newValue = editValue ?? null;
        if (field === "gender") {
          newValue = editValue === "男" ? true : editValue === "女" ? false : null;
        }
        setItems((prev) =>
          prev.map((item) => (item.id === id ? { ...item, [field]: newValue } : item))
        );
        setEditingCell(null);
        return true;
      }
    } finally {
      setSaving(false);
    }
    return false;
  }, [editingCell, editValue, config.apiPath]);

  const submitCreate = useCallback(async () => {
    setSaving(true);
    try {
      const body = config.buildCreateBody ? config.buildCreateBody(createForm) : createForm;
      const res = await fetch(config.apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setCreating(false);
        setCreateForm({});
        await load();
        return true;
      }
    } finally {
      setSaving(false);
    }
    return false;
  }, [config, createForm, load]);


  return {
    items, loading, error, keyword, setKeyword,
    filters, setFilter, applyFilters, resetFilters,
    editMode, setEditMode,
    editingCell, editValue, setEditValue,
    startEdit, cancelEdit, saveCell,
    creating, setCreating, createForm, setCreateForm,
    submitCreate,
    saving, load,
    showHistory, setShowHistory,
    page, pageSize, total, setPage,
  };
}
