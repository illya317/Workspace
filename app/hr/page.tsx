"use client";

import { useEffect, useState, useRef, Fragment, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import UserMenu from "@/app/components/UserMenu";
import { matchEmployee } from "@/lib/search";

interface User {
  id: number;
  name: string;
  canAccessHR: boolean;
  isWorkListAdmin: boolean;
  company?: string | null;
}

const COMPANY_MAP: Record<string, string> = {
  "丰华生物": "01",
  "丰华天力通": "02",
  "丰华悦通": "03",
  "丰华制药": "04",
  "加拿大": "05",
};

const HR_COMPANIES = ["丰华生物", "丰华制药"];

// 01/02/03 共享存储，05 加拿大独立但查询时同属丰华集团
const SHARED_GROUP = ["01", "02", "03"];
const FENGHUA_ALL = ["01", "02", "03", "05"];

function getCompanyCodes(companyCode: string): string {
  if (FENGHUA_ALL.includes(companyCode)) {
    return FENGHUA_ALL.join(",");
  }
  return companyCode;
}

interface Employee {
  id: number;
  employeeId: string;
  name: string;
  company: string | null;
  center: string | null;
  dept1: string | null;
  dept2: string | null;
  position: string | null;
  gender: string | null;
  ethnicity: string | null;
  hometown: string | null;
  politics: string | null;
  education: string | null;
  title: string | null;
  school: string | null;
  major: string | null;
  majorRelevant: string | null;
  phone: string | null;
  office1: string | null;
  office2: string | null;
  office3: string | null;
  attendance1: string | null;
  attendance2: string | null;
  joinDate: string | null;
  nature: string | null;
  status?: string | null;
  leaveDate?: string | null;
  alias?: string | null;
  deleted?: boolean | null;
  deletedTime?: string | null;
  deletedBy?: string | null;
}

interface FieldDef {
  key: string;
  label: string;
}

type HRTab = "roster" | "codes" | "attendance" | "works" | "performance";

const tabs: { key: HRTab; label: string; desc: string }[] = [
  { key: "roster", label: "花名册", desc: "员工花名册管理" },
  { key: "codes", label: "编码", desc: "部门与岗位编码管理" },
  { key: "attendance", label: "考勤", desc: "考勤记录与统计" },
  { key: "works", label: "工作查看", desc: "查看全员工作清单" },
  { key: "performance", label: "绩效", desc: "绩效考核管理" },
];

interface CodeItem {
  code: string;
  name: string;
}

function CodesTab({ user, selectedCompany }: { user: User; selectedCompany: string }) {
  const companyCode = COMPANY_MAP[selectedCompany] || "";
  return (
    <div className="flex flex-wrap gap-6">
      <CodeTab user={user} type="department" apiPath="/api/admin/department-codes" title="部门编码" companyCode={companyCode} selectedCompany={selectedCompany} />
      <CodeTab user={user} type="position" apiPath="/api/admin/position-codes" title="岗位编码" companyCode={companyCode} selectedCompany={selectedCompany} />
    </div>
  );
}

function CodeTab({
  user,
  type,
  apiPath,
  title,
  companyCode,
  selectedCompany,
}: {
  user: User;
  type: "department" | "position";
  apiPath: string;
  title: string;
  companyCode: string;
  selectedCompany: string;
}) {
  const [codes, setCodes] = useState<CodeItem[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saveTip, setSaveTip] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; code: string }>({ open: false, code: "" });
  const [sortField, setSortField] = useState<"code" | "name" | "count">("code");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [editMode, setEditMode] = useState(false);
  const [editRow, setEditRow] = useState<string | null>(null);
  const [editCodeValue, setEditCodeValue] = useState("");
  const [editNameValue, setEditNameValue] = useState("");
  const [detailModal, setDetailModal] = useState<{ open: boolean; code: string; name: string } | null>(null);

  async function load() {
    setLoading(true);
    const codesParam = companyCode ? getCompanyCodes(companyCode) : "";
    const url = codesParam ? `${apiPath}?companyCodes=${codesParam}` : apiPath;
    const [codesRes, empRes] = await Promise.all([
      fetch(url),
      fetch(`/api/employees?company=${encodeURIComponent(selectedCompany || "")}`),
    ]);
    if (codesRes.ok) {
      const data = await codesRes.json();
      setCodes(data.codes || []);
    }
    if (empRes.ok) {
      const data = await empRes.json();
      setEmployees(data.employees || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [apiPath, companyCode]);

  // 编码前缀对应的公司名（01/02/03 共享）
  const PREFIX_TO_COMPANIES: Record<string, string[]> = {
    "01": ["丰华生物", "丰华天力通", "丰华悦通"],
    "02": ["丰华生物", "丰华天力通", "丰华悦通"],
    "03": ["丰华生物", "丰华天力通", "丰华悦通"],
    "04": ["丰华制药"],
    "05": ["加拿大"],
  };

  // 计算每个编码的人数统计
  useEffect(() => {
    const map: Record<string, number> = {};
    for (const c of codes) {
      const prefix = c.code.slice(0, 2);
      const allowedCompanies = PREFIX_TO_COMPANIES[prefix] || [];
      const companyEmps = employees.filter((e) => allowedCompanies.includes(e.company || ""));
      if (type === "department") {
        map[c.code] = companyEmps.filter((e) => e.dept1 === c.name).length;
      } else {
        map[c.code] = companyEmps.filter((e) => {
          if (!e.position) return false;
          const positions = e.position.split("、").map((p) => p.trim());
          return positions.includes(c.name);
        }).length;
      }
    }
    setStats(map);
  }, [codes, employees, type]);

  function toggleSort(field: "code" | "name" | "count") {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  }

  const sortedCodes = [...codes].sort((a, b) => {
    if (sortField === "count") {
      const aVal = stats[a.code] || 0;
      const bVal = stats[b.code] || 0;
      if (aVal !== bVal) return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      return a.code.localeCompare(b.code);
    }
    const aVal = sortField === "code" ? a.code : a.name;
    const bVal = sortField === "code" ? b.code : b.name;
    if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  // 本地计算完整编码（用于状态更新）
  function buildFullCode(shortCode: string): string {
    const normalized = companyCode ? (SHARED_GROUP.includes(companyCode) ? "01" : companyCode) : "";
    return normalized ? normalized + shortCode : shortCode;
  }

  function startEditRow(item: CodeItem) {
    if (!user.isWorkListAdmin) return;
    setEditRow(item.code);
    setEditCodeValue(item.code.length === 5 ? item.code.slice(2) : item.code);
    setEditNameValue(item.name);
  }

  function cancelEditRow() {
    setEditRow(null);
    setEditCodeValue("");
    setEditNameValue("");
  }

  async function saveEditRow(originalCode: string) {
    if (!/^\d{3}$/.test(editCodeValue)) {
      setSaveTip("编号必须为3位数字");
      setTimeout(() => setSaveTip(""), 2000);
      return;
    }
    const newFullCode = buildFullCode(editCodeValue);

    if (newFullCode !== originalCode && codes.some((c) => c.code === newFullCode)) {
      setSaveTip("编号已存在");
      setTimeout(() => setSaveTip(""), 2000);
      return;
    }

    // 编号变化时：先删后建
    if (newFullCode !== originalCode) {
      const delRes = await fetch(`${apiPath}?code=${encodeURIComponent(originalCode)}`, { method: "DELETE" });
      if (!delRes.ok) {
        setSaveTip("保存失败");
        setTimeout(() => setSaveTip(""), 2000);
        return;
      }
    }

    const putRes = await fetch(apiPath, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: editCodeValue, name: editNameValue.trim(), companyCode }),
    });
    if (putRes.ok) {
      setCodes((prev) =>
        prev
          .filter((c) => c.code !== originalCode)
          .concat({ code: newFullCode, name: editNameValue.trim() })
          .sort((a, b) => a.code.localeCompare(b.code))
      );
      setSaveTip("保存成功");
      setTimeout(() => setSaveTip(""), 1500);
    } else {
      setSaveTip("保存失败");
      setTimeout(() => setSaveTip(""), 2000);
    }
    setEditRow(null);
  }

  async function doDelete(code: string) {
    const res = await fetch(`${apiPath}?code=${encodeURIComponent(code)}`, { method: "DELETE" });
    if (res.ok) {
      setCodes((prev) => prev.filter((c) => c.code !== code));
      setSaveTip("删除成功");
      setTimeout(() => setSaveTip(""), 1500);
    } else {
      setSaveTip("删除失败");
      setTimeout(() => setSaveTip(""), 2000);
    }
  }

  async function handleAdd() {
    if (!/^\d{3}$/.test(newCode)) {
      setSaveTip("编号必须为3位数字");
      setTimeout(() => setSaveTip(""), 2000);
      return;
    }
    if (!newName.trim()) {
      setSaveTip("名称不能为空");
      setTimeout(() => setSaveTip(""), 2000);
      return;
    }
    const fullCode = buildFullCode(newCode);
    if (codes.some((c) => c.code === fullCode)) {
      setSaveTip("编号已存在");
      setTimeout(() => setSaveTip(""), 2000);
      return;
    }
    const res = await fetch(apiPath, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: newCode, name: newName.trim(), companyCode }),
    });
    if (res.ok) {
      setCodes((prev) =>
        [...prev, { code: fullCode, name: newName.trim() }].sort((a, b) =>
          a.code.localeCompare(b.code)
        )
      );
      setNewCode("");
      setNewName("");
      setSaveTip("添加成功");
      setTimeout(() => setSaveTip(""), 1500);
    } else {
      setSaveTip("添加失败");
      setTimeout(() => setSaveTip(""), 2000);
    }
  }

  function getDetailList(codeItem: CodeItem): Employee[] {
    if (type === "department") {
      return employees.filter((e) => e.dept1 === codeItem.name);
    }
    return employees.filter((e) => e.position && e.position.includes(codeItem.name));
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">{title}</h3>

      {saveTip && (
        <div
          className={`rounded-md px-4 py-2 text-sm text-center ${
            saveTip.includes("成功") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}
        >
          {saveTip}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        {user.isWorkListAdmin && (
          <div className="flex justify-end border-b bg-gray-50 px-2 py-1.5">
            <button
              onClick={() => { setEditMode((v) => !v); setEditRow(null); }}
              className={`rounded-md px-3 py-1 text-xs ${
                editMode
                  ? "bg-amber-100 text-amber-700 border border-amber-300"
                  : "border border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {editMode ? "退出编辑" : "编辑"}
            </button>
          </div>
        )}
        {loading ? (
          <p className="p-8 text-center text-gray-500">加载中...</p>
        ) : (
          <table className="text-xs">
            <thead className="border-b bg-gray-50">
              <tr>
                <th
                  onClick={() => toggleSort("code")}
                  className="cursor-pointer whitespace-nowrap px-2 py-1.5 text-left font-medium text-gray-600 hover:bg-gray-100 select-none"
                >
                  <span className="flex items-center gap-1">
                    编号
                    {sortField === "code" && (
                      <span className="text-emerald-500">{sortDirection === "asc" ? "↑" : "↓"}</span>
                    )}
                  </span>
                </th>
                <th
                  onClick={() => toggleSort("name")}
                  className="cursor-pointer whitespace-nowrap px-2 py-1.5 text-left font-medium text-gray-600 hover:bg-gray-100 select-none"
                >
                  <span className="flex items-center gap-1">
                    名称
                    {sortField === "name" && (
                      <span className="text-emerald-500">{sortDirection === "asc" ? "↑" : "↓"}</span>
                    )}
                  </span>
                </th>
                <th
                  onClick={() => toggleSort("count")}
                  className="cursor-pointer whitespace-nowrap px-2 py-1.5 text-left font-medium text-gray-600 hover:bg-gray-100 select-none"
                >
                  <span className="flex items-center gap-1">
                    人数
                    {sortField === "count" && (
                      <span className="text-emerald-500">{sortDirection === "asc" ? "↑" : "↓"}</span>
                    )}
                  </span>
                </th>
                {editMode && user.isWorkListAdmin && (
                  <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium text-gray-600">操作</th>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedCodes.map((item) => {
                const isEditing = editRow === item.code;
                const count = stats[item.code] || 0;
                return (
                  <tr key={item.code} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="whitespace-nowrap px-2 py-1.5 text-gray-700">
                      {isEditing ? (
                        <input
                          value={editCodeValue}
                          onChange={(e) => setEditCodeValue(e.target.value)}
                          className="w-16 rounded border border-emerald-400 px-1 py-0.5 text-xs focus:outline-none"
                        />
                      ) : editMode ? (
                        <span
                          className="cursor-pointer hover:text-emerald-600"
                          onClick={() => startEditRow(item)}
                        >
                          {item.code}
                        </span>
                      ) : (
                        item.code
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-gray-700">
                      {isEditing ? (
                        <input
                          value={editNameValue}
                          onChange={(e) => setEditNameValue(e.target.value)}
                          className="w-32 rounded border border-emerald-400 px-1 py-0.5 text-xs focus:outline-none"
                        />
                      ) : editMode ? (
                        <span
                          className="cursor-pointer hover:text-emerald-600"
                          onClick={() => startEditRow(item)}
                        >
                          {item.name || "-"}
                        </span>
                      ) : (
                        <span
                          className="cursor-pointer hover:text-emerald-600"
                          onClick={() => setDetailModal({ open: true, code: item.code, name: item.name })}
                        >
                          {item.name || "-"}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-gray-700">
                      <span
                        className="cursor-pointer rounded-full bg-gray-100 px-2 py-0.5 text-xs hover:bg-gray-200"
                        onClick={() => setDetailModal({ open: true, code: item.code, name: item.name })}
                      >
                        {count}
                      </span>
                    </td>
                    {editMode && user.isWorkListAdmin && (
                      <td className="whitespace-nowrap px-2 py-1.5 text-gray-700">
                        {isEditing ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() => saveEditRow(item.code)}
                              className="rounded bg-green-500 px-2 py-0.5 text-xs text-white hover:bg-green-600"
                            >
                              保存
                            </button>
                            <button
                              onClick={cancelEditRow}
                              className="rounded bg-gray-400 px-2 py-0.5 text-xs text-white hover:bg-gray-500"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmModal({ open: true, code: item.code })}
                            className="text-red-500 hover:text-red-700"
                            title="删除"
                          >
                            ×
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {editMode && user.isWorkListAdmin && (
                <tr className="border-b last:border-0 bg-gray-50">
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <input
                      type="text"
                      value={newCode}
                      onChange={(e) => setNewCode(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                      placeholder="编号(如01)"
                      className="w-16 rounded border border-gray-300 px-1 py-0.5 text-xs focus:border-emerald-400 focus:outline-none"
                    />
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                      placeholder="名称"
                      className="w-32 rounded border border-gray-300 px-1 py-0.5 text-xs focus:border-emerald-400 focus:outline-none"
                    />
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-gray-400">-</td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <button
                      onClick={handleAdd}
                      className="rounded-md bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-700"
                    >
                      添加
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* 确认框 */}
      {confirmModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-gray-800">删除确认</h3>
            <p className="mb-6 text-sm text-gray-600">确定删除该编码？</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmModal({ open: false, code: "" })}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={() => {
                  doDelete(confirmModal.code);
                  setConfirmModal({ open: false, code: "" });
                }}
                className="rounded-md bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 人员详情弹窗 */}
      {detailModal?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg max-h-[80vh] overflow-auto rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">
                {detailModal.name} — 人员名单
              </h3>
              <button
                onClick={() => setDetailModal(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            {(() => {
              const list = getDetailList({ code: detailModal.code, name: detailModal.name });
              if (list.length === 0) {
                return <p className="text-sm text-gray-500">暂无人员</p>;
              }
              return (
                <table className="w-full text-xs">
                  <thead className="border-b bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">姓名</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">部门</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">岗位</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((emp) => (
                      <tr key={emp.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-700">{emp.name}</td>
                        <td className="px-3 py-2 text-gray-700">{emp.dept1 || "-"}</td>
                        <td className="px-3 py-2 text-gray-700">{emp.position || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

function RosterTab({ user, selectedCompany }: { user: User; selectedCompany: string }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [visibleFields, setVisibleFields] = useState<string[]>([]);
  const [allDepts, setAllDepts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDept, setFilterDept] = useState("");
  const [keyword, setKeyword] = useState("");
  const [editingCell, setEditingCell] = useState<{ id: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [sortField, setSortField] = useState<string>("employeeId");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [saveTip, setSaveTip] = useState("");
  const [deptQuery, setDeptQuery] = useState("");
  const [deptSuggestions, setDeptSuggestions] = useState<string[]>([]);
  const [showDeptSuggestions, setShowDeptSuggestions] = useState(false);
  const deptBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [confirmResignModal, setConfirmResignModal] = useState<{ open: boolean; emp: Employee | null; isLastPosition: boolean }>({ open: false, emp: null, isLastPosition: false });
  const [rosterFilter, setRosterFilter] = useState<"在职" | "离职">("在职");

  async function loadRoster(deptOverride?: string) {
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedCompany) params.set("company", selectedCompany);
    const deptParam = deptOverride !== undefined ? deptOverride : filterDept;
    if (deptParam) params.set("dept", deptParam);
    if (keyword) params.set("keyword", keyword);
    params.set("status", rosterFilter);
    const res = await fetch(`/api/employees?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setEmployees(data.employees || []);
      setFields(data.fields || []);
      setVisibleFields(data.visibleFields || []);
      setAllDepts(data.allDepts || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadRoster();
  }, [selectedCompany, filterDept, rosterFilter]);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  useEffect(() => {
    if (filterDept && !deptQuery) {
      setDeptQuery(filterDept);
    }
  }, [filterDept]);

  async function fetchDeptSuggestions(query: string) {
    if (!query.trim()) {
      setDeptSuggestions([]);
      return;
    }
    const res = await fetch(`/api/employees/autocomplete?type=dept&q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const data = await res.json();
      setDeptSuggestions(data.items || []);
    }
  }

  function startEdit(emp: Employee, field: string) {
    if (!user.isWorkListAdmin || !editMode) return;
    setEditingCell({ id: emp.id, field });
    setEditValue((emp as any)[field] || "");
  }

  async function saveEdit() {
    if (!editingCell) return;
    const { id, field } = editingCell;
    const res = await fetch(`/api/employees/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field, value: editValue || null }),
    });
    if (res.ok) {
      setEmployees((prev) =>
        prev.map((e) => (e.id === id ? { ...e, [field]: editValue || null } : e))
      );
      setSaveTip("保存成功");
      setTimeout(() => setSaveTip(""), 1500);
    } else {
      setSaveTip("保存失败");
      setTimeout(() => setSaveTip(""), 2000);
    }
    setEditingCell(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") saveEdit();
    if (e.key === "Escape") setEditingCell(null);
  }

  async function markResigned(emp: Employee, isLastPosition: boolean) {
    const today = new Date().toISOString().slice(0, 10);
    const operator = user.name;

    // 公共：软删除
    const delRes = await fetch(`/api/employees/${emp.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "deleted", value: true }),
    });
    if (delRes.ok) {
      await fetch(`/api/employees/${emp.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: "deletedTime", value: today }),
      });
      await fetch(`/api/employees/${emp.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: "deletedBy", value: operator }),
      });
    }

    if (isLastPosition) {
      // 最后一个岗位：额外标记离职
      const res = await fetch(`/api/employees/${emp.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: "status", value: "离职" }),
      });
      if (res.ok) {
        await fetch(`/api/employees/${emp.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field: "leaveDate", value: today }),
        });
        setEmployees((prev) =>
          prev.map((e) => (e.id === emp.id ? { ...e, status: "离职", leaveDate: today, deleted: true, deletedTime: today, deletedBy: operator } : e))
        );
        setSaveTip("已标记离职");
        setTimeout(() => setSaveTip(""), 1500);
      } else {
        setSaveTip("操作失败");
        setTimeout(() => setSaveTip(""), 2000);
      }
    } else {
      // 还有其他岗位：仅软删除，前端移除该行
      setEmployees((prev) => prev.filter((e) => e.id !== emp.id));
      setSaveTip("已移除该岗位");
      setTimeout(() => setSaveTip(""), 1500);
    }
    setConfirmResignModal({ open: false, emp: null, isLastPosition: false });
  }

  function downloadExcel() {
    const params = new URLSearchParams();
    if (selectedCompany) params.set("company", selectedCompany);
    if (filterDept) params.set("dept", filterDept);
    if (keyword) params.set("keyword", keyword);
    params.set("status", rosterFilter);
    params.set("export", "1");
    window.open(`/api/employees?${params.toString()}`, "_blank");
  }

  const displayFields = fields.filter((f) => visibleFields.includes(f.key));

  const sortedEmployees = [...employees].sort((a, b) => {
    const aVal = (a as any)[sortField] || "";
    const bVal = (b as any)[sortField] || "";
    if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  function toggleSort(field: string) {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  }

  return (
    <div className="space-y-4">
      {/* 筛选 */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-4 shadow-sm">
        <div className="flex rounded-md border border-gray-200 overflow-hidden">
          <button
            onClick={() => { setRosterFilter("在职"); }}
            className={`px-3 py-1.5 text-sm ${rosterFilter === "在职" ? "bg-emerald-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            在职
          </button>
          <button
            onClick={() => { setRosterFilter("离职"); }}
            className={`px-3 py-1.5 text-sm ${rosterFilter === "离职" ? "bg-emerald-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            离职
          </button>
        </div>
        <div className="relative">
          <input
            type="text"
            value={deptQuery}
            onChange={(e) => {
              setDeptQuery(e.target.value);
              fetchDeptSuggestions(e.target.value);
              setShowDeptSuggestions(true);
            }}
            onFocus={() => {
              if (deptQuery) {
                fetchDeptSuggestions(deptQuery);
                setShowDeptSuggestions(true);
              }
            }}
            onBlur={() => {
              deptBlurTimer.current = setTimeout(() => setShowDeptSuggestions(false), 200);
            }}
            onKeyDown={(e) => { if (e.key === "Enter") loadRoster(deptQuery); }}
            placeholder="部门筛选"
            className="w-48 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-emerald-400 focus:outline-none"
          />
          {showDeptSuggestions && deptSuggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg">
              {deptSuggestions.map((s) => (
                <li
                  key={s}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (deptBlurTimer.current) clearTimeout(deptBlurTimer.current);
                    setFilterDept(s);
                    setDeptQuery(s);
                    setShowDeptSuggestions(false);
                  }}
                  className="cursor-pointer px-3 py-1.5 hover:bg-emerald-50"
                >
                  {s}
                </li>
              ))}
            </ul>
          )}
        </div>
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") loadRoster(); }}
          placeholder="姓名筛选"
          className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-emerald-400 focus:outline-none"
        />
        <button
          onClick={() => { setFilterDept(""); setDeptQuery(""); setKeyword(""); setRosterFilter("在职"); loadRoster(); }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          重置
        </button>
        <button
          onClick={downloadExcel}
          className="rounded-md border border-emerald-300 px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50"
        >
          下载Excel
        </button>
        {user.isWorkListAdmin && (
          <button
            onClick={() => { setEditMode((v) => !v); setEditingCell(null); }}
            className={`rounded-md px-3 py-2 text-sm ${editMode ? "bg-amber-100 text-amber-700 border border-amber-300" : "border border-gray-300 text-gray-600 hover:bg-gray-50"}`}
          >
            {editMode ? "退出修改" : "修改"}
          </button>
        )}
      </div>

      {/* 保存提示 */}
      {saveTip && (
        <div className={`rounded-md px-4 py-2 text-sm text-center ${saveTip === "保存成功" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {saveTip}
        </div>
      )}

      {/* 表格 */}
      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-center text-gray-500">加载中...</p>
        ) : employees.length === 0 ? (
          <p className="p-8 text-center text-gray-500">暂无数据</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b bg-gray-50">
              <tr>
                {displayFields.map((f) => (
                  <Fragment key={f.key}>
                    <th
                      onClick={() => toggleSort(f.key)}
                      className="cursor-pointer whitespace-nowrap px-3 py-2 text-left font-medium text-gray-600 hover:bg-gray-100 select-none"
                    >
                      <span className="flex items-center gap-1">
                        {f.label}
                        {sortField === f.key && (
                          <span className="text-emerald-500">{sortDirection === "asc" ? "↑" : "↓"}</span>
                        )}
                      </span>
                    </th>
                    {f.key === "employeeId" && editMode && user?.isWorkListAdmin && (
                      <th className="w-8 whitespace-nowrap px-1 py-2 text-center font-medium text-gray-600"></th>
                    )}
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedEmployees.map((emp) => (
                <tr key={emp.id} className={`border-b last:border-0 hover:bg-gray-50 ${emp.status === "离职" ? "bg-gray-100" : ""}`}>
                  {displayFields.map((f) => {
                    const isEditing = editingCell?.id === emp.id && editingCell?.field === f.key;
                    const val = (emp as any)[f.key] || "";
                    return (
                      <Fragment key={f.key}>
                        <td
                          onClick={() => startEdit(emp, f.key)}
                          className={`whitespace-nowrap px-3 py-2 text-gray-700 ${
                            user.isWorkListAdmin && editMode ? "cursor-pointer hover:bg-emerald-50" : ""
                          }`}
                        >
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <input
                                ref={inputRef}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => setEditingCell(null)}
                                onKeyDown={handleKeyDown}
                                className="w-full rounded border border-emerald-400 px-1 py-0.5 text-xs focus:outline-none"
                              />
                              <button
                                onMouseDown={(e) => { e.preventDefault(); saveEdit(); }}
                                className="shrink-0 rounded bg-emerald-500 px-1.5 py-0.5 text-[10px] text-white hover:bg-emerald-600"
                              >
                                保存
                              </button>
                            </div>
                          ) : (
                            val || "-"
                          )}
                        </td>
                        {f.key === "employeeId" && editMode && user?.isWorkListAdmin && (
                          <td className="w-8 whitespace-nowrap px-1 py-2 text-center">
                            {emp.status !== "离职" && !emp.deleted && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const otherActive = employees.filter(
                                    (e2) => e2.employeeId === emp.employeeId && e2.id !== emp.id && e2.status !== "离职" && !e2.deleted
                                  );
                                  const isLastPosition = otherActive.length === 0;
                                  setConfirmResignModal({ open: true, emp, isLastPosition });
                                }}
                                className="text-red-400 hover:text-red-600"
                                title="标记离职"
                              >
                                ×
                              </button>
                            )}
                          </td>
                        )}
                      </Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 标记离职/移除岗位确认框 */}
      {confirmResignModal.open && confirmResignModal.emp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-gray-800">
              {confirmResignModal.isLastPosition ? "确认标记离职" : "确认移除岗位"}
            </h3>
            <p className="mb-6 text-sm text-gray-600">
              {confirmResignModal.isLastPosition ? (
                <>确定将 <strong>{confirmResignModal.emp.name}</strong> 标记为离职？</>
              ) : (
                <><strong>{confirmResignModal.emp.name}</strong> 还有其他在职岗位，确定移除当前岗位？</>
              )}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmResignModal({ open: false, emp: null, isLastPosition: false })}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={() => markResigned(confirmResignModal.emp!, confirmResignModal.isLastPosition)}
                className="rounded-md bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HRPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<HRTab>("roster");
  const [selectedCompany, setSelectedCompany] = useState<string>("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (!data.user || !data.user.canAccessHR) {
          router.push("/portal");
          return;
        }
        setUser(data.user);
        const defaultCompany = data.user.isWorkListAdmin
          ? (HR_COMPANIES.includes(data.user.company || "") ? data.user.company : HR_COMPANIES[0])
          : (data.user.company || "");
        setSelectedCompany(defaultCompany);
        setLoading(false);
      })
      .catch(() => router.push("/portal"));
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">加载中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Image
              src="/company/logo.png"
              alt={process.env.NEXT_PUBLIC_COMPANY_NAME || "公司"}
              width={100}
              height={30}
              className="h-auto w-auto max-w-[100px] object-contain"
            />
            <span className="text-sm text-gray-400">|</span>
            <span className="text-sm font-medium text-gray-700">人事行政管理</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/portal")}
              className="text-sm text-gray-500 hover:text-emerald-600"
            >
              返回入口
            </button>
            <UserMenu user={user} />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* 公司选择器 */}
        <div className="mb-4 flex items-center gap-3">
          <span className="text-sm font-medium text-gray-600">当前公司：</span>
          {user?.isWorkListAdmin ? (
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-emerald-400 focus:outline-none"
            >
              {HR_COMPANIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          ) : (
            <span className="rounded-md bg-gray-100 px-3 py-1.5 text-sm text-gray-700">
              {selectedCompany || "未设置"}
            </span>
          )}
        </div>

        <div className="mb-6 flex gap-2 overflow-x-auto border-b border-gray-200 pb-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`whitespace-nowrap rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === t.key
                  ? "border-b-2 border-emerald-500 text-emerald-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === "roster" && user && <RosterTab user={user} selectedCompany={selectedCompany} />}
        {activeTab === "codes" && user && <CodesTab user={user} selectedCompany={selectedCompany} />}
        {activeTab !== "roster" && activeTab !== "codes" && (
          <div className="rounded-lg bg-white p-12 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-gray-400">
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-800">
              {tabs.find((t) => t.key === activeTab)?.label}
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              {tabs.find((t) => t.key === activeTab)?.desc} — 功能建设中，敬请期待
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
