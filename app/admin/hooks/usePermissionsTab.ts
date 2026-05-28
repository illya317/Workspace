"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { matchEmployee, matchText } from "@/lib/search";
import { getAvailableRoles } from "@/lib/permissions";
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
    deptPath?: string[];
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

const ROLE_META: Record<string, { name: string; color: string }> = {
  access: { name: "访问", color: "emerald" },
  write: { name: "编辑", color: "blue" },
  delete: { name: "删除", color: "red" },
  admin: { name: "管理", color: "purple" },
};

const ROLE_PRIORITY: Record<string, number> = {
  admin: 4,
  write: 3,
  delete: 2,
  access: 1,
};

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
  const [systemAdminIds, setSystemAdminIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [l1Dept, setL1Dept] = useState("全部");
  const [l2Dept, setL2Dept] = useState("全部");
  const [l3Dept, setL3Dept] = useState("全部");
  const [nameSearch, setNameSearch] = useState("");
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

  const roles = useMemo(() => {
    const keys = getAvailableRoles(selectedResource);
    return keys.map((k) => ({ key: k, ...(ROLE_META[k] || { name: k, color: "gray" }) }));
  }, [selectedResource]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("subjectType", subjectType);
      if (selectedResource) params.set("resourceKey", selectedResource);

      const res = await fetch(`/api/admin/permission-grants?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRawSubjects(data.subjects || []);
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
  }, [subjectType, selectedResource, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reset dept filters when subject type changes
  useEffect(() => {
    setL1Dept("全部");
    setL2Dept("全部");
    setL3Dept("全部");
  }, [subjectType]);

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

  const getPermissionState = useCallback(
    (subject: Subject, roleKey: string): PermissionState => {
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
    },
    [systemAdminIds, directGrants, selectedResource, ancestorResourceKeys, subjectType, positionGrants, departmentGrants]
  );

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

  // ─── Cascade department options ───
  const l1Options = useMemo(() => {
    const set = new Set(rawSubjects.map((s) => s.extra?.deptPath?.[0]).filter(Boolean));
    return ["全部", ...Array.from(set)];
  }, [rawSubjects]);

  const l2Options = useMemo(() => {
    const set = new Set(
      rawSubjects
        .filter((s) => l1Dept === "全部" || s.extra?.deptPath?.[0] === l1Dept)
        .map((s) => s.extra?.deptPath?.[1])
        .filter(Boolean)
    );
    return ["全部", ...Array.from(set)];
  }, [rawSubjects, l1Dept]);

  const l3Options = useMemo(() => {
    const set = new Set(
      rawSubjects
        .filter(
          (s) =>
            (l1Dept === "全部" || s.extra?.deptPath?.[0] === l1Dept) &&
            (l2Dept === "全部" || s.extra?.deptPath?.[1] === l2Dept)
        )
        .map((s) => s.extra?.deptPath?.[2])
        .filter(Boolean)
    );
    return ["全部", ...Array.from(set)];
  }, [rawSubjects, l1Dept, l2Dept]);

  // ─── Filtered + sorted subjects ───
  const subjects = useMemo(() => {
    let result = [...rawSubjects];

    // Dept cascade filter
    if (l1Dept !== "全部") {
      result = result.filter((s) => s.extra?.deptPath?.[0] === l1Dept);
    }
    if (l2Dept !== "全部") {
      result = result.filter((s) => s.extra?.deptPath?.[1] === l2Dept);
    }
    if (l3Dept !== "全部") {
      result = result.filter((s) => s.extra?.deptPath?.[2] === l3Dept);
    }

    // Name search (client-side, with pinyin)
    if (nameSearch) {
      result = result.filter((s) => {
        if (subjectType === "user") {
          return matchEmployee(
            {
              name: s.name,
              employeeId: s.extra?.employeeId as string | undefined,
              alias: undefined,
            },
            nameSearch
          );
        }
        return matchText(s.name, nameSearch);
      });
    }

    // Sort: highest permission first (admin > write > delete > access)
    result.sort((a, b) => {
      const aScore = Math.max(
        ...roles.map((r) =>
          getPermissionState(a, r.key).has ? (ROLE_PRIORITY[r.key] || 0) : 0
        )
      );
      const bScore = Math.max(
        ...roles.map((r) =>
          getPermissionState(b, r.key).has ? (ROLE_PRIORITY[r.key] || 0) : 0
        )
      );
      return bScore - aScore;
    });

    return result;
  }, [rawSubjects, l1Dept, l2Dept, l3Dept, nameSearch, subjectType, getPermissionState, roles]);

  return {
    subjectType,
    setSubjectType,
    selectedResource,
    setSelectedResource,
    parentResource,
    setParentResource,
    subjects,
    loading,
    l1Dept,
    setL1Dept,
    l2Dept,
    setL2Dept,
    l3Dept,
    setL3Dept,
    l1Options,
    l2Options,
    l3Options,
    nameSearch,
    setNameSearch,
    expandedRows,
    toggleRowExpand,
    topResources,
    childResources,
    roles,
    getPermissionState,
    toggleGrant,
    systemAdminIds,
  };
}
