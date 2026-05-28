"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { ResourceItem } from "../types";

export type SubjectType = "user" | "position" | "department";

interface Subject {
  id: number;
  name: string;
  extra?: {
    employeeId?: string;
    userId?: number | null;
    hasUser?: boolean;
    company?: string;
    department?: string;
    positionIds?: number[];
    departmentIds?: number[];
    code?: string;
  };
}

interface Grant {
  subjectId: number;
  resourceKey: string;
  roleKey: string;
}

interface PermissionState {
  has: boolean;
  source: "direct" | "position" | "department" | "ancestor" | "system.admin" | null;
}

const ROLES = [
  { key: "access", name: "访问", color: "emerald" },
  { key: "write", name: "编辑", color: "blue" },
  { key: "delete", name: "删除", color: "red" },
  { key: "admin", name: "管理", color: "purple" },
];

export function usePermissionsTab(
  resources: ResourceItem[],
  showToast: (msg: string, type?: "success" | "error") => void
) {
  const [subjectType, setSubjectType] = useState<SubjectType>("user");
  const [selectedResource, setSelectedResource] = useState<string | null>(null);
  const [parentResource, setParentResource] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [directGrants, setDirectGrants] = useState<Grant[]>([]);
  const [positionGrants, setPositionGrants] = useState<Grant[]>([]);
  const [departmentGrants, setDepartmentGrants] = useState<Grant[]>([]);
  const [ancestorResourceKeys, setAncestorResourceKeys] = useState<string[]>([]);
  const [systemAdminIds, setSystemAdminIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [companyFilter, setCompanyFilter] = useState("全部");
  const [deptFilter, setDeptFilter] = useState("全部");
  const [keywordFilter, setKeywordFilter] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const topResources = useMemo(
    () => resources.filter((r) => !r.key.includes(".")),
    [resources]
  );

  const childResources = useMemo(() => {
    const parent = parentResource || selectedResource;
    if (!parent || parent.includes(".")) return [];
    return resources.filter(
      (r) =>
        r.key.startsWith(parent + ".") &&
        r.key.split(".").length === parent.split(".").length + 1
    );
  }, [resources, parentResource, selectedResource]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("subjectType", subjectType);
      if (selectedResource) params.set("resourceKey", selectedResource);
      if (companyFilter !== "全部") params.set("company", companyFilter);
      if (deptFilter !== "全部") params.set("department", deptFilter);
      if (keywordFilter) params.set("keyword", keywordFilter);

      const res = await fetch(`/api/admin/permission-grants?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSubjects(data.subjects || []);
        setDirectGrants(data.directGrants || []);
        setPositionGrants(data.positionGrants || []);
        setDepartmentGrants(data.departmentGrants || []);
        setAncestorResourceKeys(data.ancestorResourceKeys || []);
      } else {
        showToast("加载权限数据失败", "error");
      }
    } catch {
      showToast("加载权限数据失败", "error");
    } finally {
      setLoading(false);
    }
  }, [subjectType, selectedResource, companyFilter, deptFilter, keywordFilter, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load system admin IDs
  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data) => {
        const users = (data.users || []) as Array<{
          id: number;
          isWorkListAdmin?: boolean;
        }>;
        const ids = users
          .filter((u) => u.isWorkListAdmin)
          .map((u) => u.id);
        setSystemAdminIds(new Set(ids));
      })
      .catch(() => {});
  }, []);

  function getPermissionState(
    subject: Subject,
    roleKey: string
  ): PermissionState {
    // system.admin bypass
    if (systemAdminIds.has(subject.id)) {
      return { has: true, source: "system.admin" };
    }

    // direct grant (including ancestors and admin-implied)
    const directMatch = directGrants.find(
      (g) =>
        g.subjectId === subject.id &&
        (g.resourceKey === selectedResource ||
          ancestorResourceKeys.includes(g.resourceKey)) &&
        (g.roleKey === roleKey || g.roleKey === "admin")
    );
    if (directMatch) {
      return {
        has: true,
        source:
          directMatch.resourceKey === selectedResource ? "direct" : "ancestor",
      };
    }

    const extra = subject.extra;

    // position inheritance (only for user subjects)
    if (subjectType === "user" && extra?.positionIds?.length) {
      const posMatch = positionGrants.find(
        (g) =>
          extra.positionIds!.includes(g.subjectId) &&
          (g.resourceKey === selectedResource ||
            ancestorResourceKeys.includes(g.resourceKey)) &&
          (g.roleKey === roleKey || g.roleKey === "admin")
      );
      if (posMatch) return { has: true, source: "position" };
    }

    // department inheritance (only for user subjects)
    if (subjectType === "user" && extra?.departmentIds?.length) {
      const deptMatch = departmentGrants.find(
        (g) =>
          extra.departmentIds!.includes(g.subjectId) &&
          (g.resourceKey === selectedResource ||
            ancestorResourceKeys.includes(g.resourceKey)) &&
          (g.roleKey === roleKey || g.roleKey === "admin")
      );
      if (deptMatch) return { has: true, source: "department" };
    }

    return { has: false, source: null };
  }

  async function toggleGrant(subject: Subject, roleKey: string) {
    if (subjectType === "user" && !subject.extra?.hasUser) {
      showToast("该员工未关联账号，无法授权", "error");
      return;
    }

    const state = getPermissionState(subject, roleKey);
    const subjectId =
      subjectType === "user" ? subject.extra?.userId ?? subject.id : subject.id;

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

  function toggleRowExpand(subjectId: number) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(subjectId)) next.delete(subjectId);
      else next.add(subjectId);
      return next;
    });
  }

  const companies = useMemo(() => {
    const set = new Set(
      subjects.map((s) => s.extra?.company).filter(Boolean)
    );
    return ["全部", ...Array.from(set)];
  }, [subjects]);

  const depts = useMemo(() => {
    const set = new Set(
      subjects.map((s) => s.extra?.department).filter(Boolean)
    );
    return ["全部", ...Array.from(set)];
  }, [subjects]);

  return {
    subjectType,
    setSubjectType,
    selectedResource,
    setSelectedResource,
    parentResource,
    setParentResource,
    subjects,
    loading,
    companyFilter,
    setCompanyFilter,
    deptFilter,
    setDeptFilter,
    keywordFilter,
    setKeywordFilter,
    expandedRows,
    toggleRowExpand,
    topResources,
    childResources,
    ROLES,
    getPermissionState,
    toggleGrant,
    companies,
    depts,
    systemAdminIds,
  };
}
