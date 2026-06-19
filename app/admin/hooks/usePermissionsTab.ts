"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { ResourceItem, Subject, Grant, SubjectType } from "../types";
import { ROLE_META, computePermissionState } from "../lib";
import { usePermissionFilters } from "./usePermissionFilters";
import { useSystemAdminIds } from "./useSystemAdminIds";

function findResourceInTree(nodes: ResourceItem[], key: string): ResourceItem | null {
  for (const n of nodes) {
    if (n.key === key) return n;
    if (n.children) {
      const f = findResourceInTree(n.children, key);
      if (f) return f;
    }
  }
  return null;
}

export type PermissionsTabState = ReturnType<typeof usePermissionsTab>;

export function usePermissionsTab(
  resources: ResourceItem[],
  showToast: (msg: string, type?: "success" | "error") => void
) {
  const [subjectType, setSubjectType] = useState<SubjectType>("user");
  const [selectedResource, setSelectedResource] = useState<string | null>(null);
  const [rawSubjects, setRawSubjects] = useState<Subject[]>([]);
  const [directGrants, setDirectGrants] = useState<Grant[]>([]);
  const [positionGrants, setPositionGrants] = useState<Grant[]>([]);
  const [departmentGrants, setDepartmentGrants] = useState<Grant[]>([]);
  const [ancestorResourceKeys, setAncestorResourceKeys] = useState<string[]>([]);
  const [maxRoleKey, setMaxRoleKey] = useState("admin");
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [bypassEnabled, setBypassEnabled] = useState(true);
  const [loading, setLoading] = useState(false);

  const systemAdminIds = useSystemAdminIds();

  const roles = useMemo(() => {
    // Work collaboration subresources only need module-level admin grants in this matrix.
    if (selectedResource === "work.task" || selectedResource === "work.report" || selectedResource === "work.plan" || selectedResource === "work.history") {
      return [{ key: "admin", ...(ROLE_META.admin || { name: "管理", color: "purple" }) }];
    }
    // DB-driven: business roles capped by maxRoleKey, admin always available
    let maxAction: string = "admin";
    if (selectedResource) {
      const found = findResourceInTree(resources, selectedResource);
      if (found?.effectiveMaxRoleKey) maxAction = found.effectiveMaxRoleKey;
    }
    const H = { access: 0, write: 1, delete: 2, admin: 3 } as Record<string, number>;
    const maxLvl = H[maxAction] ?? 3;
    const keys: string[] = (["access", "write", "delete"] as const).filter((k) => (H[k] ?? 0) <= maxLvl);
    keys.push("admin"); // always available
    return keys.map((k) => ({ key: k, ...(ROLE_META[k] || { name: k, color: "gray" }) }));
  }, [selectedResource, resources]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("subjectType", subjectType);
      if (selectedResource) params.set("resourceKey", selectedResource);

      const res = await fetch(
        `/workspace/api/admin/permission-grants?${params.toString()}`
      );
      if (res.ok) {
        const data = await res.json();
        setRawSubjects(data.subjects || []);
        setDirectGrants(data.directGrants || []);
        setPositionGrants(data.positionGrants || []);
        setDepartmentGrants(data.departmentGrants || []);
        setAncestorResourceKeys(data.ancestorResourceKeys || []);
        setMaxRoleKey(data.maxRoleKey || "admin");
        setIsSystemAdmin(data.isSystemAdmin || false);
        setBypassEnabled(data.systemAdminBusinessBypass !== false);
      } else {
        showToast("加载权限数据失败", "error");
      }
    } catch {
      showToast("加载权限数据失败", "error");
    } finally {
      setLoading(false);
    }
  }, [subjectType, selectedResource, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Child resource keys for gray checkmark (no parent grant but child has)
  const childResourceKeys = useMemo(() => {
    if (!selectedResource) return [];
    const node = findResourceInTree(resources, selectedResource);
    return (node?.children || []).map((c) => c.key);
  }, [selectedResource, resources]);

  const getPermissionState = useCallback(
    (subject: Subject, roleKey: string) =>
      computePermissionState(
        subject, roleKey, selectedResource, ancestorResourceKeys,
        systemAdminIds, bypassEnabled,
        directGrants, positionGrants, departmentGrants, subjectType,
        childResourceKeys,
      ),
    [
      selectedResource, ancestorResourceKeys, systemAdminIds, bypassEnabled,
      directGrants, positionGrants, departmentGrants, subjectType, childResourceKeys,
    ]
  );

  async function toggleGrant(subject: Subject, roleKey: string) {
    if (subjectType === "user" && !subject.extra?.hasUser) {
      showToast("该员工未关联账号，无法授权", "error");
      return;
    }

    const state = getPermissionState(subject, roleKey);
    const subjectId =
      subjectType === "user"
        ? subject.extra?.userId ?? subject.id
        : subject.id;

    if (!subjectId) {
      showToast("无法确定授权对象", "error");
      return;
    }

    try {
      const res = await fetch("/workspace/api/admin/permission-grants", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectType,
          subjectId,
          resourceKey: selectedResource,
          roleKey,
          value: state.source === "direct" ? !state.has : true,
        }),
      });
      if (res.ok) {
        showToast(state.source !== "direct" || !state.has ? "已授权" : "已取消授权", "success");
        await loadData();
      } else {
        const e = await res.json().catch(() => ({ error: "操作失败" }));
        showToast(e.error, "error");
      }
    } catch {
      showToast("网络错误", "error");
    }
  }

  const updateMaxRole = useCallback(async (newMax: string) => {
    if (!selectedResource) return;
    try {
      const res = await fetch("/workspace/api/admin/permission-grants/max-role", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceKey: selectedResource, maxRoleKey: newMax }),
      });
      if (res.ok) {
        setMaxRoleKey(newMax);
        showToast("最高权限已更新", "success");
        await loadData();
      } else {
        const e = await res.json().catch(() => ({ error: "操作失败" }));
        showToast(e.error, "error");
      }
    } catch {
      showToast("网络错误", "error");
    }
  }, [selectedResource, showToast, loadData]);

  const filters = usePermissionFilters(
    rawSubjects,
    subjectType,
    getPermissionState,
    roles
  );

  return {
    subjectType, setSubjectType, selectedResource, setSelectedResource,
    subjects: filters.subjects, loading,
    l1Dept: filters.l1Dept, setL1Dept: filters.setL1Dept,
    l2Dept: filters.l2Dept, setL2Dept: filters.setL2Dept,
    l3Dept: filters.l3Dept, setL3Dept: filters.setL3Dept,
    l1Options: filters.l1Options, l2Options: filters.l2Options, l3Options: filters.l3Options,
    nameSearch: filters.nameSearch, setNameSearch: filters.setNameSearch,
    expandedRows: filters.expandedRows, toggleRowExpand: filters.toggleRowExpand,
    roles,
    getPermissionState, toggleGrant,
    maxRoleKey, isSystemAdmin, updateMaxRole, systemAdminIds,
  };
}
