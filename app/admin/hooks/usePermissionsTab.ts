"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { getAvailableRoles } from "@/lib/permissions";
import type { ResourceItem, Subject, Grant, SubjectType } from "../types";
import { ROLE_META, computePermissionState } from "../lib";
import { usePermissionFilters } from "./usePermissionFilters";
import { usePermissionScope } from "./usePermissionScope";
import { useSystemAdminIds } from "./useSystemAdminIds";

export type PermissionsTabState = ReturnType<typeof usePermissionsTab>;

export function usePermissionsTab(
  resources: ResourceItem[],
  showToast: (msg: string, type?: "success" | "error") => void
) {
  const [subjectType, setSubjectType] = useState<SubjectType>("user");
  const [selectedResource, setSelectedResource] = useState<string | null>(null);
  const [parentResource, setParentResource] = useState<string | null>(null);
  const [rawSubjects, setRawSubjects] = useState<Subject[]>([]);
  const [directGrants, setDirectGrants] = useState<Grant[]>([]);
  const [positionGrants, setPositionGrants] = useState<Grant[]>([]);
  const [departmentGrants, setDepartmentGrants] = useState<Grant[]>([]);
  const [ancestorResourceKeys, setAncestorResourceKeys] = useState<string[]>([]);
  const [maxRoleKey, setMaxRoleKey] = useState("admin");
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [loading, setLoading] = useState(false);

  const systemAdminIds = useSystemAdminIds();
  const scope = usePermissionScope(selectedResource);

  const topResources = useMemo(
    () => resources.filter((r) => !r.key.includes(".")),
    [resources]
  );

  const childResources = useMemo(() => {
    const parent = parentResource || selectedResource;
    if (!parent) return [];
    // 从树结构中找选中节点的直接子节点
    function findChildren(nodes: ResourceItem[], targetKey: string): ResourceItem[] {
      for (const n of nodes) {
        if (n.key === targetKey) return n.children || [];
        if (n.children?.length) {
          const f = findChildren(n.children, targetKey);
          if (f.length) return f;
        }
      }
      return [];
    }
    return findChildren(resources, parent);
  }, [resources, parentResource, selectedResource]);

  const roles = useMemo(() => {
    const keys = getAvailableRoles(selectedResource);
    return keys.map((k) => ({
      key: k,
      ...(ROLE_META[k] || { name: k, color: "gray" }),
    }));
  }, [selectedResource]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("subjectType", subjectType);
      if (selectedResource) params.set("resourceKey", selectedResource);
      if (scope.scopeId !== undefined) params.set("scopeId", scope.scopeId ?? "");

      const res = await fetch(
        `/api/admin/permission-grants?${params.toString()}`
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
      } else {
        showToast("加载权限数据失败", "error");
      }
    } catch {
      showToast("加载权限数据失败", "error");
    } finally {
      setLoading(false);
    }
  }, [subjectType, selectedResource, showToast, scope.scopeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reset scope when resource changes
  useEffect(() => { scope.resetScope(); }, [selectedResource]); // eslint-disable-line

  const getPermissionState = useCallback(
    (subject: Subject, roleKey: string) =>
      computePermissionState(
        subject,
        roleKey,
        selectedResource,
        ancestorResourceKeys,
        systemAdminIds,
        directGrants,
        positionGrants,
        departmentGrants,
        subjectType
      ),
    [
      selectedResource, ancestorResourceKeys, systemAdminIds,
      directGrants, positionGrants, departmentGrants, subjectType,
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
      const res = await fetch("/api/admin/permission-grants", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectType,
          subjectId,
          resourceKey: selectedResource,
          roleKey,
          value: !state.has,
          scopeId: scope.scopeId ?? null,
        }),
      });
      if (res.ok) {
        showToast(!state.has ? "已授权" : "已取消授权", "success");
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
      const res = await fetch("/api/admin/permission-grants/max-role", {
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
    parentResource, setParentResource,
    subjects: filters.subjects, loading,
    l1Dept: filters.l1Dept, setL1Dept: filters.setL1Dept,
    l2Dept: filters.l2Dept, setL2Dept: filters.setL2Dept,
    l3Dept: filters.l3Dept, setL3Dept: filters.setL3Dept,
    l1Options: filters.l1Options, l2Options: filters.l2Options, l3Options: filters.l3Options,
    nameSearch: filters.nameSearch, setNameSearch: filters.setNameSearch,
    expandedRows: filters.expandedRows, toggleRowExpand: filters.toggleRowExpand,
    topResources, childResources, roles,
    getPermissionState, toggleGrant,
    maxRoleKey, isSystemAdmin, updateMaxRole, systemAdminIds, scope,
  };
}
