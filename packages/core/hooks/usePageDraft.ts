"use client";

import { useCallback, useMemo, useState } from "react";

export interface PageDraftChange<TKey, TValue> {
  key: TKey;
  initialValue: TValue;
  value: TValue;
}

export interface UsePageDraftOptions<TValue> {
  isEqual?: (left: TValue, right: TValue) => boolean;
}

/**
 * 通用页面草稿状态：业务页面负责定义 key/value，Core 只统一编辑、dirty、取消和提交后的状态收口。
 */
export function usePageDraft<TKey, TValue>({
  isEqual = Object.is,
}: UsePageDraftOptions<TValue> = {}) {
  const [editMode, setEditMode] = useState(false);
  const [changeMap, setChangeMap] = useState<Map<TKey, PageDraftChange<TKey, TValue>>>(() => new Map());

  const startEdit = useCallback(() => {
    setEditMode(true);
  }, []);

  const setDraft = useCallback((key: TKey, initialValue: TValue, value: TValue) => {
    setChangeMap((previous) => {
      const existing = previous.get(key);
      const baseline = existing ? existing.initialValue : initialValue;
      const next = new Map(previous);
      if (isEqual(baseline, value)) next.delete(key);
      else next.set(key, { key, initialValue: baseline, value });
      return next;
    });
  }, [isEqual]);

  const discardDraft = useCallback((key: TKey) => {
    setChangeMap((previous) => {
      if (!previous.has(key)) return previous;
      const next = new Map(previous);
      next.delete(key);
      return next;
    });
  }, []);

  const valueFor = useCallback((key: TKey, fallback: TValue) => {
    const change = changeMap.get(key);
    return change ? change.value : fallback;
  }, [changeMap]);

  const cancelEdit = useCallback(() => {
    setChangeMap(new Map());
    setEditMode(false);
  }, []);

  const acceptChanges = useCallback(() => {
    setChangeMap(new Map());
    setEditMode(false);
  }, []);

  const changes = useMemo(() => Array.from(changeMap.values()), [changeMap]);

  return {
    editMode,
    dirty: changeMap.size > 0,
    changes,
    startEdit,
    setDraft,
    discardDraft,
    valueFor,
    cancelEdit,
    acceptChanges,
  };
}
