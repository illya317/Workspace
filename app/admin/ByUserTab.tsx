"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import FilterBar from "@/app/components/FilterBar";
import ConfirmModal from "@/app/components/ConfirmModal";
import { isTopLevelResource } from "./page";
import type { ResourceItem, DeptItem } from "./page";

interface SearchResult {
  rowId: number; employeeId: string; name: string; alias: string;
  dept1: string; position: string; userId: number | null;
}

interface EmployeePerm {
  employeeId: string; name: string; canLogin: boolean; hasApiKey: boolean;
  userId: number | null; username: string | null; permissions: string[];
  roles: { company: string | null; dept1: string | null; position: string | null }[];
  resourceRoles: Array<{
    resource: { key: string; name: string } | null;
    role: { key: string; name: string } | null;
  }>;
}

interface Props {
  user: { id: number; name: string; isWorkListAdmin: boolean; isAnyGroupAdmin: boolean };
  resources: ResourceItem[];
  roles: Array<{ id: number; key: string; name: string; description: string | null }>;
  allDepts: DeptItem[];
  showToast: (msg: string, type?: "success" | "error") => void;
}

export default function ByUserTab({ user, resources, allDepts, showToast }: Props) {
  const [empPerms, setEmpPerms] = useState<EmployeePerm[]>([]);
  const [empPermLoading, setEmpPermLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<SearchResult | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const [companyFilter, setCompanyFilter] = useState("全部");
  const [deptFilter, setDeptFilter] = useState("全部");
  const [keywordFilter, setKeywordFilter] = useState("");
  const [selectedResource, setSelectedResource] = useState("system");

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

  const doSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setSearchResults([]); setShowDropdown(false); return; }
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/employees/search?q=${encodeURIComponent(q.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.items || []);
          setShowDropdown(true);
        }
      } catch { /* ignore */ } finally { setSearchLoading(false); }
    }, 300);
  }, []);

  function handleSearchChange(value: string) { setSearchQuery(value); doSearch(value); }

  function handleSelectUser(r: SearchResult) {
    setSelectedUser(r); setSearchQuery(""); setSearchResults([]); setShowDropdown(false);
  }

  function getSelectedUserPerms(): EmployeePerm | null {
    if (!selectedUser) return null;
    return empPerms.find((e) => e.employeeId === selectedUser.employeeId) || null;
  }

  function userHasAccess(emp: EmployeePerm, resourceKey: string): boolean {
    return emp.resourceRoles.some(
      (rr) => rr.resource?.key === resourceKey && rr.role?.key === "access"
    );
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

  async function handleResetPassword(userId: number, employeeId: string, name: string) {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "POST" });
      if (res.ok) {
        setResetResult((await res.json()).password);
      } else {
        showToast("密码重置失败", "error");
      }
    } catch { showToast("网络错误", "error"); }
  }

  const topLevelResources = resources.filter((r) => isTopLevelResource(r.key));
  const companies = ["全部", ...Array.from(new Set(allDepts.map((d) => d.company).filter(Boolean)))];
  const deptOptions = ["全部", ...Array.from(new Set(
    (companyFilter === "全部" ? allDepts : allDepts.filter((d) => d.company === companyFilter))
      .map((d) => d.name)
  ))];

  const filteredEmpPerms = empPerms.filter((emp) => {
    if (companyFilter !== "全部" && !emp.roles.some((r) => r.company === companyFilter)) return false;
    if (deptFilter !== "全部" && !emp.roles.some((r) => r.dept1 === deptFilter)) return false;
    if (keywordFilter) {
      const kw = keywordFilter.toLowerCase();
      if (!emp.name.toLowerCase().includes(kw) &&
          !emp.employeeId.toLowerCase().includes(kw) &&
          !emp.username?.toLowerCase().includes(kw)) return false;
    }
    return true;
  });

  function formatCsv(arr: (string | null)[], fallback = "-") {
    return arr.filter(Boolean).join(" / ") || fallback;
  }

  return (
    <div className="space-y-6">
      {/* ===== Section 1: Permission Card ===== */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-sm font-semibold text-gray-700">权限卡片</h3>

        <div className="relative mb-4">
          <input
            type="text" placeholder="搜索员工姓名/工号…"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
          />
          {searchLoading && <span className="absolute right-3 top-2.5 text-xs text-gray-400">搜索中…</span>}
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
              {searchResults.map((item, idx) => (
                <button
                  key={`${item.employeeId}-${item.rowId}-${idx}`}
                  onMouseDown={(e) => { e.preventDefault(); handleSelectUser(item); }}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-emerald-50"
                >
                  <span className="font-medium text-gray-800">{item.name}</span>
                  <span className="text-xs text-gray-400">{item.employeeId}</span>
                  {item.dept1 && <span className="text-xs text-gray-500">{item.dept1}</span>}
                  {item.position && <span className="text-xs text-gray-400">{item.position}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedUser ? (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-gray-50 p-3">
              <span className="font-medium text-gray-800">{selectedUser.name}</span>
              <span className="text-xs text-gray-400">{selectedUser.employeeId}</span>
              {getSelectedUserPerms()?.username && (
                <span className="text-xs text-gray-500">账号: {getSelectedUserPerms()!.username}</span>
              )}
              {(selectedUser.dept1 || selectedUser.position) && (
                <span className="text-xs text-gray-500">
                  {[selectedUser.dept1, selectedUser.position].filter(Boolean).join(" / ")}
                </span>
              )}
              {getSelectedUserPerms() && !getSelectedUserPerms()!.canLogin && (
                <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-600">已停用</span>
              )}
            </div>

            <h4 className="mb-2 text-xs font-medium text-gray-500">全局开关</h4>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {topLevelResources.map((r) => {
                const perms = getSelectedUserPerms();
                const hasAccess = perms ? userHasAccess(perms, r.key) : false;
                return (
                  <button key={r.key} title={r.description || r.name}
                    onClick={() => togglePermission(selectedUser.userId, r.key, hasAccess)}
                    disabled={!selectedUser.userId}
                    className={`rounded-lg border p-3 text-center text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      hasAccess
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-gray-200 bg-gray-50 text-gray-500 hover:border-emerald-200 hover:bg-emerald-50/50"
                    }`}
                  >
                    <div className="font-medium">{r.name}</div>
                    <div className={`mt-1 text-xs ${hasAccess ? "text-emerald-600" : "text-gray-400"}`}>
                      {hasAccess ? "已授权" : "未授权"}
                    </div>
                  </button>
                );
              })}
            </div>

            <h4 className="mb-2 text-xs font-medium text-gray-500">范围分配（只读）</h4>
            {(() => {
              const perms = getSelectedUserPerms();
              if (!perms) return <p className="text-sm text-gray-400">未找到权限数据</p>;
              const scoped = perms.resourceRoles.filter(
                (rr) => rr.resource && !isTopLevelResource(rr.resource.key)
              );
              if (scoped.length === 0) return <p className="text-sm text-gray-400">无范围分配</p>;
              return (
                <div className="space-y-1.5">
                  {scoped.map((rr, idx) => (
                    <div key={`${rr.resource!.key}-${idx}`}
                      className="flex items-center gap-2 rounded bg-gray-50 px-3 py-1.5 text-sm">
                      <span className="text-gray-600">{rr.resource!.name}</span>
                      <span className="text-xs text-gray-400">({rr.resource!.key})</span>
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">
                        {rr.role!.name}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </>
        ) : (
          <p className="text-sm text-gray-400">请搜索并选择员工来查看权限卡片</p>
        )}
      </div>

      {/* ===== Section 2: Employee Roster Table ===== */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-sm font-semibold text-gray-700">员工权限列表</h3>

        <FilterBar>
          <select value={companyFilter}
            onChange={(e) => { setCompanyFilter(e.target.value); setDeptFilter("全部"); }}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none">
            {companies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none">
            {deptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <input type="text" placeholder="搜索姓名/工号/账号…"
            value={keywordFilter} onChange={(e) => setKeywordFilter(e.target.value)}
            className="min-w-[160px] rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none"
          />
          <select value={selectedResource}
            onChange={(e) => setSelectedResource(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none">
            {resources.map((r) => {
              const depth = r.key.split(".").length - 1;
              return <option key={r.key} value={r.key}>{"  ".repeat(depth)}{r.name}</option>;
            })}
          </select>
        </FilterBar>

        {empPermLoading ? (
          <div className="mt-4 text-center"><p className="text-sm text-gray-400">加载中…</p></div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500">
                  <th className="whitespace-nowrap pb-2 pr-3">姓名 / 工号</th>
                  <th className="whitespace-nowrap pb-2 pr-3">账号</th>
                  <th className="whitespace-nowrap pb-2 pr-3">公司</th>
                  <th className="whitespace-nowrap pb-2 pr-3">部门</th>
                  <th className="whitespace-nowrap pb-2 pr-3">岗位</th>
                  <th className="whitespace-nowrap pb-2 pr-3">权限状态</th>
                  <th className="whitespace-nowrap pb-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmpPerms.map((emp) => {
                  const hasAccess = userHasAccess(emp, selectedResource);
                  return (
                    <tr key={`${emp.employeeId}-${emp.userId ?? "x"}`}
                      className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="whitespace-nowrap py-2 pr-3">
                        <span className="font-medium text-gray-800">{emp.name}</span>
                        <span className="ml-1.5 text-xs text-gray-400">{emp.employeeId}</span>
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3">
                        <span className="text-gray-600">{emp.username || "-"}</span>
                        {!emp.canLogin && (
                          <span className="ml-1 rounded bg-red-100 px-1 text-xs text-red-600">停</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-gray-600">
                        {formatCsv(emp.roles.map((r) => r.company))}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-gray-600">
                        {formatCsv(emp.roles.map((r) => r.dept1))}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-gray-600">
                        {formatCsv(emp.roles.map((r) => r.position))}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3">
                        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                          hasAccess ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
                        }`}>
                          {hasAccess ? "已授权" : "未授权"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-2">
                        <button
                          onClick={() => togglePermission(emp.userId, selectedResource, hasAccess)}
                          className={`rounded px-2 py-1 text-xs transition-colors ${
                            hasAccess
                              ? "bg-red-50 text-red-600 hover:bg-red-100"
                              : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                          }`}>
                          {hasAccess ? "撤销" : "授权"}
                        </button>
                        {user.isWorkListAdmin && emp.userId && (
                          <button
                            onClick={() => setPwdModal({
                              open: true, userId: emp.userId,
                              employeeId: emp.employeeId, name: emp.name,
                            })}
                            className="ml-1 rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                            title="重置密码">重置</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredEmpPerms.length === 0 && (
              <p className="mt-4 text-center text-sm text-gray-400">无匹配结果</p>
            )}
          </div>
        )}
      </div>

      {/* ===== Confirm Modal: Password Reset ===== */}
      <ConfirmModal
        open={pwdModal.open}
        title="重置密码"
        message={
          resetResult
            ? `${pwdModal.name} 的新密码已生成，请复制并妥善保管：\n\n${resetResult}`
            : `确定要重置 ${pwdModal.name} (${pwdModal.employeeId}) 的密码吗？重置后将生成随机密码。`
        }
        confirmLabel={resetResult ? "已复制" : "确定重置"}
        cancelLabel={resetResult ? "关闭" : "取消"}
        confirmDanger={!resetResult}
        onConfirm={() => {
          if (resetResult) {
            navigator.clipboard.writeText(resetResult).catch(() => {});
            setPwdModal({ open: false, userId: null, employeeId: "", name: "" });
            setResetResult(null);
            return;
          }
          if (pwdModal.userId) {
            handleResetPassword(pwdModal.userId, pwdModal.employeeId, pwdModal.name);
          }
        }}
        onCancel={() => {
          setPwdModal({ open: false, userId: null, employeeId: "", name: "" });
          setResetResult(null);
        }}
      />
    </div>
  );
}
