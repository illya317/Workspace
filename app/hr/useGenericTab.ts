"use client";

import { useState, useCallback, useEffect } from "react";
import type { TabConfig } from "./types";

export interface GenericTabState {
  items: any[];
  loading: boolean;
  keyword: string;
  setKeyword: (v: string) => void;
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
  deleteItem: (id: number) => Promise<boolean>;
  versions: Array<{ version: number; createdAt: string; editor?: { name: string } }>;
  currentVersion: number | undefined;
  loadVersions: (entityId: number) => Promise<void>;
  selectVersion: (version: number) => Promise<void>;
  saving: boolean;
  load: () => Promise<void>;
}

export function useGenericTab(config: TabConfig): GenericTabState {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editingCell, setEditingCell] = useState<{ id: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState<any>("");
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [versions, setVersions] = useState<Array<{ version: number; createdAt: string; editor?: { name: string } }>>([]);
  const [currentVersion, setCurrentVersion] = useState<number | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (keyword) params.set("keyword", keyword);
      const res = await fetch(`${config.apiPath}?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const list = config.listGetter ? config.listGetter(data) : data.items || data;
        setItems(Array.isArray(list) ? list : []);
      }
    } finally {
      setLoading(false);
    }
  }, [config.apiPath, config.listGetter, keyword]);

  useEffect(() => {
    load();
  }, [load]);

  const startEdit = useCallback((id: number, field: string, initialValue: any) => {
    setEditingCell({ id, field });
    setEditValue(initialValue ?? "");
    setCurrentVersion(undefined);
    loadVersions(id);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue("");
    setCurrentVersion(undefined);
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
        setItems((prev) =>
          prev.map((item) => (item.id === id ? { ...item, [field]: editValue ?? null } : item))
        );
        setEditingCell(null);
        setEditMode(false);
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

  const deleteItem = useCallback(async (id: number) => {
    const res = await fetch(`${config.apiPath}/${id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((prev) => prev.filter((item) => item.id !== id));
      return true;
    }
    return false;
  }, [config.apiPath]);

  const loadVersions = useCallback(async (entityId: number) => {
    const res = await fetch(`/api/admin/edit-history?entityType=${config.entityType}&entityId=${entityId}`);
    if (res.ok) {
      const data = await res.json();
      setVersions(data.versions || []);
    }
  }, [config.entityType]);

  const selectVersion = useCallback(async (version: number) => {
    if (version === 0) {
      setCurrentVersion(undefined);
      if (editingCell) {
        const item = items.find((i) => i.id === editingCell.id);
        if (item) setEditValue(item[editingCell.field] ?? "");
      }
      return;
    }
    if (!editingCell) {
      setCurrentVersion(version);
      return;
    }
    const res = await fetch(
      `/api/admin/edit-history?entityType=${config.entityType}&entityId=${editingCell.id}&version=${version}`
    );
    if (res.ok) {
      const data = await res.json();
      const snapshot = JSON.parse(data.version.dataJson);
      setEditValue(snapshot[editingCell.field] ?? "");
      setCurrentVersion(version);
    }
  }, [config.entityType, editingCell, items]);

  return {
    items, loading, keyword, setKeyword,
    editMode, setEditMode,
    editingCell, editValue, setEditValue,
    startEdit, cancelEdit, saveCell,
    creating, setCreating, createForm, setCreateForm,
    submitCreate, deleteItem,
    versions, currentVersion, loadVersions, selectVersion,
    saving, load,
  };
}
