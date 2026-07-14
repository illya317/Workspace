"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useDebouncedEffect, usePageDraft } from "@workspace/core/hooks";
import { workspacePath } from "@workspace/core/routing";
import type { TabConfig } from "@workspace/hr/types";

export interface TabItem {
  id: number | string;
  [key: string]: unknown;
}

export interface SaveDraftResult {
  ok: boolean;
  error?: string;
}

function isFkEditValue(value: unknown): value is { id?: number; name?: string } {
  return Boolean(value && typeof value === "object" && ("id" in value || "name" in value));
}

function editValuesEqual(left: unknown, right: unknown) {
  if (isFkEditValue(left) || isFkEditValue(right)) {
    return (isFkEditValue(left) ? left.id ?? null : left ?? null)
      === (isFkEditValue(right) ? right.id ?? null : right ?? null);
  }
  if ((left === null || left === undefined || left === "") && (right === null || right === undefined || right === "")) return true;
  if (typeof left === "boolean" || typeof right === "boolean") return left === right;
  return String(left) === String(right);
}

function cellKey(id: number, field: string) {
  return `${id}:${field}`;
}

function parseCellKey(key: string) {
  const separator = key.indexOf(":");
  return { id: Number(key.slice(0, separator)), field: key.slice(separator + 1) };
}

function valueForSave(field: string, value: unknown) {
  if (isFkEditValue(value)) return value.id ?? null;
  if (field === "gender") return value === "男" || value === true ? true : value === "女" || value === false ? false : null;
  return value ?? null;
}

export interface GenericTabState {
  items: TabItem[];
  loading: boolean;
  error: string | null;
  keyword: string;
  searchKeyword: string;
  setKeyword: (v: string) => void;
  filters: Record<string, string>;
  setFilter: (key: string, value: string) => void;
  applyFilters: (next: Record<string, string>) => void;
  resetFilters: () => void;
  editMode: boolean;
  dirty: boolean;
  startPageEdit: () => void;
  cancelPageEdit: () => void;
  editingCell: { id: number; field: string } | null;
  editValue: unknown;
  setEditValue: (v: unknown) => void;
  startEdit: (id: number, field: string, initialValue: unknown) => void;
  finishCellEdit: () => void;
  discardCellEdit: () => void;
  saveDraft: () => Promise<SaveDraftResult>;

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
  const apiPath = workspacePath(config.apiPath);
  const [baseItems, setBaseItems] = useState<TabItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    if (config.filters) {
      for (const f of config.filters) {
        if (f.defaultValue !== undefined) init[f.key] = f.defaultValue;
      }
    }
    return init;
  });
  const [editingCell, setEditingCell] = useState<{ id: number; field: string } | null>(null);
  const [editingInitialValue, setEditingInitialValue] = useState<unknown>("");
  const pageDraft = usePageDraft<string, unknown>({ isEqual: editValuesEqual });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [page, setPageRaw] = useState(1);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState(0);

  const syncSearchKeyword = useCallback(() => {
    setSearchKeyword(keyword);
    setPageRaw(1);
  }, [keyword]);

  // Debounce keyword → searchKeyword（300ms），搜索时自动重置到第 1 页
  useDebouncedEffect(syncSearchKeyword, 300);

  const setPage = useCallback((v: number) => {
    setPageRaw(v);
  }, []);

  // 加载原始数据（searchKeyword + filters + 分页）
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (searchKeyword) params.set("keyword", searchKeyword);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      for (const [key, value] of Object.entries(filters)) {
        if (value !== "" && value !== undefined && value !== null) {
          params.set(key, value);
        }
      }
      const res = await fetch(`${apiPath}?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const list = config.listGetter ? config.listGetter(data) : data.items || data;
        setBaseItems(Array.isArray(list) ? (list as TabItem[]) : []);
        setTotal(typeof data.total === "number" ? data.total : 0);
      } else {
        const data = await res.json().catch(() => ({ error: `请求失败 (${res.status})` }));
        setError(data.error || `请求失败 (${res.status})`);
        setBaseItems([]);
        setTotal(0);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "网络错误");
      setBaseItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [config, apiPath, searchKeyword, page, pageSize, filters]);

  useEffect(() => {
    load();
  }, [load]);

  const setFilter = useCallback((key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPageRaw(1);
  }, []);

  const applyFilters = useCallback((next: Record<string, string>) => {
    setFilters(next);
    setPageRaw(1);
  }, []);

  const resetFilters = useCallback(() => {
    const init: Record<string, string> = {};
    if (config.filters) {
      for (const f of config.filters) {
        if (f.defaultValue !== undefined) init[f.key] = f.defaultValue;
      }
    }
    setFilters(init);
    setPageRaw(1);
  }, [config.filters]);

  const startEdit = useCallback((id: number, field: string, initialValue: unknown) => {
    setEditingCell({ id, field });
    setEditingInitialValue(initialValue ?? "");
  }, []);

  const finishCellEdit = useCallback(() => {
    setEditingCell(null);
    setEditingInitialValue("");
  }, []);

  const discardCellEdit = useCallback(() => {
    if (editingCell) pageDraft.discardDraft(cellKey(editingCell.id, editingCell.field));
    setEditingCell(null);
    setEditingInitialValue("");
  }, [editingCell, pageDraft]);

  const setEditValue = useCallback((value: unknown) => {
    if (!editingCell) return;
    pageDraft.setDraft(cellKey(editingCell.id, editingCell.field), editingInitialValue, value);
  }, [editingCell, editingInitialValue, pageDraft]);

  const editValue = editingCell
    ? pageDraft.valueFor(cellKey(editingCell.id, editingCell.field), editingInitialValue)
    : "";

  const items = useMemo(() => baseItems.map((item) => {
    const next = { ...item };
    for (const field of config.fields) {
      const key = cellKey(Number(item.id), field.key);
      const change = pageDraft.changes.find((entry) => entry.key === key);
      if (!change) continue;
      next[field.key] = valueForSave(field.key, change.value);
      if (field.displayField && isFkEditValue(change.value)) next[field.displayField] = change.value.name ?? "";
    }
    return next;
  }), [baseItems, config.fields, pageDraft.changes]);

  const cancelPageEdit = useCallback(() => {
    setEditingCell(null);
    setEditingInitialValue("");
    pageDraft.cancelEdit();
  }, [pageDraft]);

  const saveDraft = useCallback(async () => {
    if (!pageDraft.dirty) return { ok: true };
    setSaving(true);
    try {
      const changes = pageDraft.changes.map((change) => {
        const { id, field } = parseCellKey(change.key);
        return { id, field, value: valueForSave(field, change.value) };
      });
      const res = await fetch(apiPath, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes }),
      });
      if (res.ok) {
        setEditingCell(null);
        setEditingInitialValue("");
        pageDraft.acceptChanges();
        await load();
        return { ok: true };
      }
      const data = await res.json().catch(() => null) as { error?: string } | null;
      return { ok: false, error: data?.error || `保存失败 (${res.status})` };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "网络错误" };
    } finally {
      setSaving(false);
    }
  }, [apiPath, load, pageDraft]);

  return {
    items, loading, error, keyword, searchKeyword, setKeyword,
    filters, setFilter, applyFilters, resetFilters,
    editMode: pageDraft.editMode, dirty: pageDraft.dirty,
    startPageEdit: pageDraft.startEdit, cancelPageEdit,
    editingCell, editValue, setEditValue,
    startEdit, finishCellEdit, discardCellEdit, saveDraft,
    saving, load,
    showHistory, setShowHistory,
    page, pageSize, total, setPage,
  };
}
