"use client";

import { useEffect, useState } from "react";
import { isTopLevelResource, userHasAccess } from "./lib";
import { matchEmployee } from "@/lib/search";
import { useSearch } from "@/lib/useSearch";
import type { ResourceItem, DeptItem, SearchResult, EmployeePerm, AdminUser } from "./types";

export interface ByUserTabState {
  // Permission Card
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  searchResults: SearchResult[];
  searchLoading: boolean;
  showDropdown: boolean;
  setShowDropdown: (v: boolean) => void;
  selectedUser: SearchResult | null;
  handleSearchChange: (value: string) => void;
  handleSelectUser: (r: SearchResult) => void;
  getSelectedUserPerms: () => EmployeePerm | null;

  // Filters
  companyFilter: string;
  setCompanyFilter: (v: string) => void;
  deptFilter: string;
  setDeptFilter: (v: string) => void;
  keywordFilter: string;
  setKeywordFilter: (v: string) => void;
  authFilter: "全部" | "已授权" | "未授权";
  setAuthFilter: (v: "全部" | "已授权" | "未授权") => void;
  selectedParent: string;
  setSelectedParent: (v: string) => void;
  selectedChild: string;
  setSelectedChild: (v: string) => void;

  // Data
  empPerms: EmployeePerm[];
  empPermLoading: boolean;

  // Modal
  pwdModal: { open: boolean; userId: number | null; employeeId: string; name: string };
  setPwdModal: (v: { open: boolean; userId: number | null; employeeId: string; name: string }) => void;
  resetResult: string | null;
  setResetResult: (v: string | null) => void;

  // Handlers
  loadEmpPerms: () => Promise<void>;
  togglePermission: (userId: number | null, resourceKey: string, currentVal: boolean) => Promise<void>;
  handleResetPassword: (userId: number, employeeId: string, name: string) => Promise<void>;

  // Computed
  topLevelResources: ResourceItem[];
  childrenOfParent: ResourceItem[];
  selectedResource: string;
  companies: string[];
  deptOptions: string[];
  filteredEmpPerms: EmployeePerm[];

  // Helpers
  userHasAccess: (emp: EmployeePerm, resourceKey: string) => boolean;
  getAllAccessState: (emp: EmployeePerm) => boolean;

  // User ref
  user: AdminUser;

  // Toast (passthrough)
  showToast: (msg: string, type?: "success" | "error") => void;
}

export function useByUserTab(
  user: AdminUser,
  resources: ResourceItem[],
  allDepts: DeptItem[],
  showToast: (msg: string, type?: "success" | "error") => void
): ByUserTabState {
  const [empPerms, setEmpPerms] = useState<EmployeePerm[]>([]);
  const [empPermLoading, setEmpPermLoading] = useState(true);

  const { query: searchQuery, setQuery: setSearchQuery, results: searchResults, loading: searchLoading, showDropdown, setShowDropdown } = useSearch<SearchResult>({ target: "employee" });
  const [selectedUser, setSelectedUser] = useState<SearchResult | null>(null);

  const [companyFilter, setCompanyFilter] = useState("全部");
  const [deptFilter, setDeptFilter] = useState("全部");
  const [keywordFilter, setKeywordFilter] = useState("");
  const [authFilter, setAuthFilter] = useState<"全部" | "已授权" | "未授权">("全部");
  const [selectedParent, setSelectedParent] = useState("system");
  const [selectedChild, setSelectedChild] = useState("__all__");

  const topLevelResources = resources.filter((r) => isTopLevelResource(r.key));
  const childrenOfParent = resources.filter(
    (r) => r.key.startsWith(selectedParent + ".") && r.key.split(".").length === selectedParent.split(".").length + 1
  );
  const selectedResource = selectedChild === "__all__" ? selectedParent : selectedChild;

  const [pwdModal, setPwdModal] = useState<{
    open: boolean; userId: number | null; employeeId: string; name: string;
  }>({ open: false, userId: null, employeeId: "", name: "" });
  const [resetResult, setResetResult] = useState<string | null>(null);

  useEffect(() => { loadEmpPerms(); }, []);

  async function loadEmpPerms() {
    setEmpPermLoading(true);
    try {
      const res = await fetch("/api/admin/employee-permissions");
      if (res.ok) {
        setEmpPerms((await res.json()).employees || []);
      } else {
        showToast("加载员工权限失败", "error");
      }
    } catch {
      showToast("加载员工权限失败", "error");
    } finally {
      setEmpPermLoading(false);
    }
  }

  function handleSearchChange(value: string) { setSearchQuery(value); }

  function handleSelectUser(r: SearchResult) {
    setSelectedUser(r); setSearchQuery(""); setShowDropdown(false);
  }

  function getSelectedUserPerms(): EmployeePerm | null {
    if (!selectedUser) return null;
    return empPerms.find((e) => e.employeeId === selectedUser.employeeId) || null;
  }

  async function togglePermission(userId: number | null, resourceKey: string, currentVal: boolean) {
    if (!userId) { showToast("该员工尚未关联用户账号", "error"); return; }
    try {
      const res = await fetch("/api/admin/user-permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, resourceKey, roleKey: "access", value: !currentVal }),
      });
      if (res.ok) {
        showToast(!currentVal ? "已授权" : "已取消授权", "success");
        await loadEmpPerms();
      } else {
        showToast((await res.json()).error || "操作失败", "error");
      }
    } catch { showToast("网络错误", "error"); }
  }

  async function handleResetPassword(userId: number, _employeeId: string, _name: string) {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "POST" });
      if (res.ok) {
        const pwd = (await res.json()).password;
        setResetResult(pwd);
        try { await navigator.clipboard.writeText(pwd); } catch { /* ignore */ }
      } else {
        showToast("密码重置失败", "error");
      }
    } catch { showToast("网络错误", "error"); }
  }

  const companies = ["全部", ...Array.from(new Set(allDepts.map((d) => d.managementGroup).filter(Boolean)))];
  const deptOptions = ["全部", ...Array.from(new Set(
    (companyFilter === "全部" ? allDepts : allDepts.filter((d) => d.managementGroup === companyFilter))
      .map((d) => d.name)
  ))];

  const filtered = empPerms.filter((emp) => {
    if (companyFilter !== "全部" && !emp.roles.some((r) => r.managementGroup === companyFilter)) return false;
    if (deptFilter !== "全部" && !emp.roles.some((r) => r.dept1 === deptFilter)) return false;
    if (keywordFilter) {
      if (!matchEmployee(emp, keywordFilter)) return false;
    }
    if (authFilter !== "全部") {
      const has = userHasAccess(emp, selectedResource);
      if (authFilter === "已授权" && !has) return false;
      if (authFilter === "未授权" && has) return false;
    }
    return true;
  });

  const filteredEmpPerms = [...filtered].sort((a, b) => {
    const aAuth = userHasAccess(a, selectedResource) ? 0 : 1;
    const bAuth = userHasAccess(b, selectedResource) ? 0 : 1;
    return aAuth - bAuth;
  });

  function getAllAccessState(emp: EmployeePerm): boolean {
    if (childrenOfParent.length === 0) return userHasAccess(emp, selectedParent);
    return childrenOfParent.every((c) => userHasAccess(emp, c.key));
  }

  return {
    searchQuery, setSearchQuery, searchResults, searchLoading, showDropdown, setShowDropdown,
    selectedUser, handleSearchChange, handleSelectUser, getSelectedUserPerms,
    companyFilter, setCompanyFilter, deptFilter, setDeptFilter,
    keywordFilter, setKeywordFilter, authFilter, setAuthFilter,
    selectedParent, setSelectedParent, selectedChild, setSelectedChild,
    empPerms, empPermLoading,
    pwdModal, setPwdModal, resetResult, setResetResult,
    loadEmpPerms, togglePermission, handleResetPassword,
    topLevelResources, childrenOfParent, selectedResource,
    companies, deptOptions, filteredEmpPerms,
    userHasAccess, getAllAccessState,
    user,
    showToast,
  };
}
