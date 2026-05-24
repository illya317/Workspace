"use client";

import { useState, useEffect, useMemo } from "react";
import { useByPermissionTab } from "./useByPermissionTab";
import type { ResourceItem } from "./types";
import FilterBar from "@/app/components/FilterBar";
import { matchEmployee } from "@/lib/search";
import { resolveCompanyFilter } from "@/lib/company";
import { HIDDEN_RESOURCE_KEYS } from "./lib";

interface Props {
  user: { id: number; name: string; isWorkListAdmin: boolean; isAnyGroupAdmin: boolean };
  resources: ResourceItem[];
  showToast: (msg: string, type?: "success" | "error") => void;
}

interface EmployeePerm {
  employeeId: string; name: string; userId: number | null; username: string | null;
  permissions: string[]; canLogin: boolean; hasApiKey: boolean;
  roles: Array<{ company: string | null; dept1: string | null; position: string | null }>;
  resourceRoles: Array<{ resource: { key: string; name: string } | null; role: { key: string; name: string } | null }>;
}

// ─── Card Grid ─────────────────────────────────────────────

function CardGrid({ resources, selectedKey, onCardClick }: {
  resources: ResourceItem[];
  selectedKey: string | null;
  onCardClick: (key: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {resources.map((r) => (
        <button key={r.id}
          onClick={() => onCardClick(r.key)}
          className={`rounded-lg border p-4 text-left shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50 ${
            selectedKey === r.key ? "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-400" : "border-gray-200 bg-white"
          }`}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">{r.name}</h3>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              {r.userCount ?? 0} 人
            </span>
          </div>
          {r.description && <p className="mt-1 text-xs text-gray-500">{r.description}</p>}
          <p className="mt-0.5 text-xs text-gray-400">{r.key}</p>
        </button>
      ))}
    </div>
  );
}

// ─── System Admins ────────────────────────────────────────

function SystemAdminsSection({
  sysLoading, systemAdmins, sysConfirm, sysSearchQ, sysResults,
  onSearchChange, onAdd, onRemove,
}: {
  sysLoading: boolean;
  systemAdmins: Array<{ id: number; name: string; username: string }>;
  sysConfirm: number | null; sysSearchQ: string;
  sysResults: Array<{ rowId: number; employeeId: string; name: string; dept1: string; userId: number | null }>;
  onSearchChange: (q: string) => void;
  onAdd: (userId: number, name: string) => void;
  onRemove: (adminId: number) => void;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-semibold text-gray-800">系统管理员</h2>
        <span className="text-sm text-gray-500">({systemAdmins.length} 人)</span>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        {sysLoading ? <p className="py-4 text-center text-sm text-gray-500">加载中...</p> : (
          <>
            {systemAdmins.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {systemAdmins.map((a) => {
                  const confirming = sysConfirm === a.id;
                  return (
                    <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-800">
                      {a.name} <span className="text-xs text-gray-400">({a.username})</span>
                      <button type="button" onClick={() => onRemove(a.id)}
                        className={`ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${confirming ? "bg-red-100 text-red-600" : "text-gray-400 hover:bg-red-50 hover:text-red-500"}`}
                      >{confirming ? "?" : "×"}</button>
                    </span>
                  );
                })}
              </div>
            )}
            <div className="relative">
              <input type="text" value={sysSearchQ} onChange={(e) => onSearchChange(e.target.value)}
                placeholder="搜索员工姓名/工号添加管理员..." className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
              {sysSearchQ.trim() && sysResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
                  <div className="max-h-48 overflow-y-auto">
                    {sysResults.map((emp) => (
                      <div key={`${emp.rowId}-${emp.employeeId}`} onClick={() => onAdd(emp.userId!, emp.name)}
                        className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-emerald-50">
                        <span className="font-medium text-gray-800">{emp.name}</span>
                        <span className="text-xs text-gray-400">{emp.employeeId}{emp.dept1 ? ` · ${emp.dept1}` : ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// ─── Employee Panel ───────────────────────────────────────

function EmployeePanel({ drillKey, empPerms, empLoading, fCompany, fDept, fKeyword,
  setFCompany, setFDept, setFKeyword, allCompanies, allDepts, onToggle, onClose, empHasAccess,
}: {
  drillKey: string;
  empPerms: EmployeePerm[]; empLoading: boolean;
  fCompany: string; fDept: string; fKeyword: string;
  setFCompany: (v: string) => void; setFDept: (v: string) => void; setFKeyword: (v: string) => void;
  allCompanies: string[]; allDepts: string[];
  onToggle: (emp: EmployeePerm) => void;
  onClose: () => void;
  empHasAccess: (emp: EmployeePerm, key: string) => boolean;
}) {
  const filtered = useMemo(() => empPerms.filter(emp => {
    if (fCompany !== "全部" && !emp.roles.some(r => resolveCompanyFilter(fCompany).includes(r.company || "" || ""))) return false;
    if (fDept !== "全部" && !emp.roles.some(r => r.dept1 === fDept)) return false;
    if (fKeyword && !matchEmployee(emp, fKeyword)) return false;
    return true;
  }).sort((a, b) => {
    const aHas = empHasAccess(a, drillKey) ? 0 : 1;
    const bHas = empHasAccess(b, drillKey) ? 0 : 1;
    return aHas - bHas;
  }), [empPerms, fCompany, fDept, fKeyword, drillKey]);

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-semibold text-gray-800">人员 · {drillKey}</h2>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">关闭</button>
      </div>
      <FilterBar>
        <select value={fCompany} onChange={e => { setFCompany(e.target.value); setFDept("全部"); }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none">
          {allCompanies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={fDept} onChange={e => setFDept(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none">
          {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <input type="text" value={fKeyword} onChange={e => setFKeyword(e.target.value)}
          placeholder="搜索姓名/工号..." className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
      </FilterBar>
      {empLoading ? <p className="py-4 text-center text-sm text-gray-500">加载中...</p> : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map(emp => {
            const has = empHasAccess(emp, drillKey);
            return (
              <button key={emp.employeeId} onClick={() => onToggle(emp)}
                className={`rounded-lg border p-3 text-left text-xs transition-colors ${
                  has ? "border-emerald-200 bg-emerald-50 hover:bg-emerald-100" : "border-gray-200 bg-white hover:bg-gray-50"
                }`}>
                <div className="font-medium text-gray-800">{emp.name}</div>
                <div className="text-gray-400">{emp.employeeId}</div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─── Main ──────────────────────────────────────────────────

export default function ByPermissionTab({ user, resources, showToast }: Props) {
  const {
    topResources,
    systemAdmins,
    sysLoading, sysSearchQ, setSysSearchQ, sysResults, sysConfirm,
    handleRemoveSystemAdmin, addSystemAdmin,
  } = useByPermissionTab({ user, resources, showToast });

  const [drillKey, setDrillKey] = useState<string | null>(null);
  const [parentKey, setParentKey] = useState<string | null>(null);
  const [empPerms, setEmpPerms] = useState<EmployeePerm[]>([]);
  const [empLoading, setEmpLoading] = useState(false);

  const [fCompany, setFCompany] = useState("全部");
  const [fDept, setFDept] = useState("全部");
  const [fKeyword, setFKeyword] = useState("");

  useEffect(() => {
    if (drillKey && empPerms.length === 0) {
      setEmpLoading(true);
      fetch("/api/admin/employee-permissions")
        .then(r => r.json()).then(d => { setEmpPerms(d.employees || []); })
        .catch(() => showToast("加载员工列表失败", "error"))
        .finally(() => setEmpLoading(false));
    }
  }, [drillKey]);

  function empHasAccess(emp: EmployeePerm, resourceKey: string): boolean {
    // 子权限只检查精确匹配；顶层权限检查自身及父级（兼容现有权限继承）
    const isTopLevel = !resourceKey.includes(".");
    if (!isTopLevel) {
      return emp.resourceRoles.some(rr => rr.resource?.key === resourceKey && rr.role?.key === "access");
    }
    const parts = resourceKey.split(".");
    const keys = [resourceKey];
    while (parts.length > 1) { parts.pop(); keys.push(parts.join(".")); }
    return keys.some(k => emp.resourceRoles.some(rr => rr.resource?.key === k && rr.role?.key === "access"));
  }

  const allCompanies = useMemo(() =>
    ["全部", ...Array.from(new Set(empPerms.flatMap(e => e.roles.map(r => r.company || "").filter((c): c is string => !!c))))].sort(),
  [empPerms]);
  const allDepts = useMemo(() =>
    ["全部", ...Array.from(new Set(empPerms.flatMap(e => e.roles.map(r => r.dept1).filter((d): d is string => !!d))))].sort(),
  [empPerms]);

  async function togglePerm(emp: EmployeePerm) {
    if (!emp.userId) { showToast("该员工未关联账号", "error"); return; }
    const has = empHasAccess(emp, drillKey!);
    const res = await fetch("/api/admin/user-permissions", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: emp.userId, resourceKey: drillKey, roleKey: "access", value: !has }),
    });
    if (res.ok) {
      showToast(has ? "已取消授权" : "已授权", "success");
      const r = await fetch("/api/admin/employee-permissions");
      setEmpPerms(((await r.json()).employees || []));
    } else {
      const e = await res.json().catch(() => ({ error: "失败" }));
      showToast(e.error, "error");
    }
  }

  function getDirectChildren(parentKey: string): ResourceItem[] {
    return resources.filter(
      (r) =>
        !HIDDEN_RESOURCE_KEYS.has(r.key) &&
        r.key.startsWith(parentKey + ".") &&
        r.key.split(".").length === parentKey.split(".").length + 1
    );
  }

  const selectedChildren = parentKey ? getDirectChildren(parentKey) : [];

  function handleCardClick(key: string) {
    const isTop = !key.includes(".");
    if (isTop) {
      // Toggle parent: if already selected, deselect both
      if (parentKey === key) { setParentKey(null); setDrillKey(null); }
      else { setParentKey(key); setDrillKey(key); }
    } else {
      // Sub-card: toggle drill key, keep parent
      setDrillKey(drillKey === key ? null : key);
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-800">全局权限概览</h2>
        <CardGrid resources={topResources} selectedKey={drillKey} onCardClick={handleCardClick} />
      </section>

      {/* Sub-permissions (only for top-level cards that have children) */}
      {selectedChildren.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-800">子权限</h2>
            <span className="text-sm text-gray-400">({parentKey})</span>
          </div>
          <CardGrid resources={selectedChildren} selectedKey={drillKey} onCardClick={handleCardClick} />
        </section>
      )}

      {/* Employee cards */}
      {drillKey && (
        <EmployeePanel
          drillKey={drillKey}
          empPerms={empPerms} empLoading={empLoading}
          fCompany={fCompany} fDept={fDept} fKeyword={fKeyword}
          setFCompany={setFCompany} setFDept={setFDept} setFKeyword={setFKeyword}
          allCompanies={allCompanies} allDepts={allDepts}
          onToggle={togglePerm} onClose={() => { setDrillKey(null); setParentKey(null); }}
          empHasAccess={empHasAccess}
        />
      )}

      {user.isWorkListAdmin && (
        <SystemAdminsSection
          sysLoading={sysLoading} systemAdmins={systemAdmins} sysConfirm={sysConfirm}
          sysSearchQ={sysSearchQ} sysResults={sysResults}
          onSearchChange={setSysSearchQ} onAdd={addSystemAdmin} onRemove={handleRemoveSystemAdmin}
        />
      )}
    </div>
  );
}
