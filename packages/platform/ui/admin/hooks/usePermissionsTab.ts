"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState, useEffect, useCallback } from "react";
import type { Subject, SubjectType, PermissionActionKey, PermissionActionRecord } from "../types";
import { usePermissionFilters } from "./usePermissionFilters";

export type PermissionsTabState = ReturnType<typeof usePermissionsTab>;

function copyFallback(text: string) {
  const el = document.createElement("textarea");
  el.value = text;
  el.style.cssText = "position:fixed;opacity:0";
  document.body.appendChild(el);
  el.select();
  document.execCommand("copy");
  document.body.removeChild(el);
}

export function usePermissionsTab(
  _resources: unknown[],
  _resourceLookup: unknown[],
  showToast: (msg: string, type?: "success" | "error") => void,
  enabled = true,
) {
  const [subjectType, setSubjectType] = useState<SubjectType>("user");
  const [selectedResource, setSelectedResource] = useState<string | null>(null);
  const [rawSubjects, setRawSubjects] = useState<Subject[]>([]);
  const [actionRecords, setActionRecords] = useState<Record<number, PermissionActionRecord>>({});
  const [resourceActions, setResourceActions] = useState<PermissionActionKey[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("subjectType", subjectType);
      if (selectedResource) params.set("resourceKey", selectedResource);

      const res = await fetch(workspacePath(`/api/settings/admin/permission-grants?${params.toString()}`)
      );
      if (res.ok) {
        const data = await res.json();
        setRawSubjects(data.subjects || []);
        setActionRecords(data.actionRecords || {});
        setResourceActions(data.resourceActions || []);
      } else {
        showToast("加载权限数据失败", "error");
      }
    } catch {
      showToast("加载权限数据失败", "error");
    } finally {
      setLoading(false);
    }
  }, [enabled, subjectType, selectedResource, showToast]);

  useEffect(() => {
    if (!enabled) return;
    loadData();
  }, [enabled, loadData]);

  const getPermissionRecord = useCallback(
    (subject: Subject) => actionRecords[subject.id] ?? null,
    [actionRecords],
  );

  const getActionState = useCallback(
    (subject: Subject, actionKey: PermissionActionKey) => getPermissionRecord(subject)?.actionStates[actionKey] ?? null,
    [getPermissionRecord],
  );

  async function toggleGrant(subject: Subject, actionKey: PermissionActionKey | string) {
    if (subjectType === "user" && !subject.extra?.hasUser) {
      showToast("该员工未关联账号，无法授权", "error");
      return;
    }

    const actionState = getActionState(subject, actionKey as PermissionActionKey);
    if (!actionState) {
      showToast("该动作不可授权", "error");
      return;
    }
    const subjectId =
      subjectType === "user"
        ? subject.extra?.userId ?? subject.id
        : subject.id;

    if (!subjectId) {
      showToast("无法确定授权对象", "error");
      return;
    }

    try {
      const res = await fetch(workspacePath("/api/settings/admin/permission-grants"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectType,
          subjectId,
          resourceKey: selectedResource,
          actionKey,
          value: actionState.source === "direct" ? !actionState.has : true,
        }),
      });
      if (res.ok) {
        showToast(actionState.source !== "direct" || !actionState.has ? "已授权" : "已取消授权", "success");
        await loadData();
      } else {
        const e = await res.json().catch(() => ({ error: "操作失败" }));
        showToast(e.error, "error");
      }
    } catch {
      showToast("网络错误", "error");
    }
  }

  const updateAccountLogin = useCallback(async (subject: Subject, canLogin: boolean) => {
    const userId = subject.extra?.userId;
    if (!userId) {
      showToast("该员工未关联账号", "error");
      return;
    }
    try {
      const res = await fetch(workspacePath(`/api/settings/admin/users/${userId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: "canLogin", value: canLogin }),
      });
      if (res.ok) {
        showToast(canLogin ? "账号已启用" : "账号已停用", "success");
        await loadData();
      } else {
        const e = await res.json().catch(() => ({ error: "操作失败" }));
        showToast(e.error, "error");
      }
    } catch {
      showToast("网络错误", "error");
    }
  }, [loadData, showToast]);

  const resetAccountApiKey = useCallback(async (subject: Subject) => {
    const userId = subject.extra?.userId;
    if (!userId) {
      showToast("该员工未关联账号", "error");
      return;
    }
    try {
      const res = await fetch(workspacePath(`/api/settings/admin/users/${userId}`), { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        const msg = `${subject.name}您好，用户:${subject.extra?.username || "(未设置)"}，API Key:${data.apiKey}`;
        try {
          await navigator.clipboard.writeText(msg);
        } catch {
          copyFallback(msg);
        }
        showToast("已复制到剪贴板", "success");
      } else {
        const e = await res.json().catch(() => ({ error: "重置失败" }));
        showToast(e.error, "error");
      }
    } catch {
      showToast("网络错误", "error");
    }
  }, [showToast]);

  const filters = usePermissionFilters(
    rawSubjects,
    subjectType,
    getPermissionRecord,
  );

  return {
    subjectType, setSubjectType, selectedResource, setSelectedResource,
    subjects: filters.subjects, loading, resourceActions,
    l1Dept: filters.l1Dept, setL1Dept: filters.setL1Dept,
    l2Dept: filters.l2Dept, setL2Dept: filters.setL2Dept,
    l3Dept: filters.l3Dept, setL3Dept: filters.setL3Dept,
    l1Options: filters.l1Options, l2Options: filters.l2Options, l3Options: filters.l3Options,
    selectedDepartmentFilter: filters.selectedDepartmentFilter,
    departmentFilterOptions: filters.departmentFilterOptions,
    nameSearchOptions: filters.nameSearchOptions,
    setDepartmentFilter: filters.setDepartmentFilter,
    nameSearch: filters.nameSearch, setNameSearch: filters.setNameSearch,
    page: filters.page, pageSize: filters.pageSize, totalPages: filters.totalPages, totalSubjects: filters.totalSubjects,
    setPage: filters.setPage, setPageSize: filters.setPageSize,
    expandedRows: filters.expandedRows, toggleRowExpand: filters.toggleRowExpand,
    getPermissionRecord, getActionState, toggleGrant,
    updateAccountLogin, resetAccountApiKey,
  };
}
