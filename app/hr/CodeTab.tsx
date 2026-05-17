"use client";

import { useEffect, useState } from "react";
import EditToolbar from "@/app/components/EditToolbar";
import ConfirmModal from "@/app/components/ConfirmModal";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";
import {
  NAME_TO_CODE,
  SHARED_GROUP_CODES,
  resolveCompanyFilter,
  BIO_GROUP_CODES,
  PHARMA_CODE,
} from "@/lib/company";

interface User {
  id: number;
  name: string;
  canAccessHR: boolean;
  isWorkListAdmin: boolean;
  company?: string | null;
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

interface CodeItem {
  code: string;
  name: string;
}

export function CodesTab({
  user,
  selectedCompany,
}: {
  user: User;
  selectedCompany: string;
}) {
  const companyCode = NAME_TO_CODE[selectedCompany] || "";
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  return (
    <div className="flex gap-6">
      <div className="w-1/2">
        <CodeTab
          user={user}
          type="department"
          apiPath="/api/admin/department-codes"
          title="部门编码"
          companyCode={companyCode}
          selectedCompany={selectedCompany}
          onSelect={(code) => {
            setSelectedDept((prev) => (prev === code ? null : code));
          }}
          selectedCode={selectedDept || undefined}
        />
      </div>
      <div className="w-1/2">
        <CodeTab
          user={user}
          type="position"
          apiPath="/api/admin/position-codes"
          title="岗位编码"
          companyCode={companyCode}
          selectedCompany={selectedCompany}
          departmentCode={selectedDept || undefined}
        />
      </div>
    </div>
  );
}

export default function CodeTab({
  user,
  type,
  apiPath,
  title,
  companyCode,
  selectedCompany,
  onSelect,
  selectedCode,
  departmentCode,
}: {
  user: User;
  type: "department" | "position";
  apiPath: string;
  title: string;
  companyCode: string;
  selectedCompany: string;
  onSelect?: (code: string) => void;
  selectedCode?: string;
  departmentCode?: string;
}) {
  const [codes, setCodes] = useState<CodeItem[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const { toast, showToast, closeToast } = useToast();
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [deleteCode, setDeleteCode] = useState<string | null>(null);
  const [sortField, setSortField] = useState<"code" | "name" | "count">("code");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [editMode, setEditMode] = useState(false);
  const [editRow, setEditRow] = useState<string | null>(null);
  const [editCodeValue, setEditCodeValue] = useState("");
  const [editNameValue, setEditNameValue] = useState("");
  const [detailModal, setDetailModal] = useState<{
    open: boolean;
    code: string;
    name: string;
  } | null>(null);
  const [positionDeptModal, setPositionDeptModal] = useState<{
    open: boolean;
    code: string;
    name: string;
    departments: string[];
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [versions, setVersions] = useState<
    Array<{ version: number; createdAt: string }>
  >([]);
  const [currentVersion, setCurrentVersion] = useState<number | undefined>(
    undefined
  );

  const entityType =
    type === "department" ? "code_department" : "code_position";

  async function load() {
    setLoading(true);
    const codesParam = selectedCompany
      ? resolveCompanyFilter(selectedCompany)
          .map((n) => NAME_TO_CODE[n] || "")
          .filter(Boolean)
          .join(",")
      : "";
    const params = new URLSearchParams();
    if (codesParam) params.set("companys", codesParam);
    if (departmentCode) params.set("departmentCode", departmentCode);
    const url = params.toString() ? `${apiPath}?${params.toString()}` : apiPath;
    const [codesRes, empRes] = await Promise.all([
      fetch(url),
      fetch(
        `/api/employees?company=${encodeURIComponent(selectedCompany || "")}`
      ),
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
  }, [apiPath, companyCode, selectedCompany, departmentCode]);

  const PREFIX_TO_COMPANIES: Record<string, string[]> = {
    "01": ["丰华生物", "丰华天力通", "丰华悦通", "加拿大"],
    "02": ["丰华生物", "丰华天力通", "丰华悦通", "加拿大"],
    "03": ["丰华生物", "丰华天力通", "丰华悦通", "加拿大"],
    "04": ["丰华制药"],
    "05": ["丰华生物", "丰华天力通", "丰华悦通", "加拿大"],
  };

  useEffect(() => {
    const map: Record<string, number> = {};
    for (const c of codes) {
      const prefix = c.code.slice(0, 2);
      const allowedCompanies = PREFIX_TO_COMPANIES[prefix] || [];
      const companyEmps = employees.filter((e) =>
        allowedCompanies.includes(e.company || "")
      );
      if (type === "department") {
        map[c.code] = new Set(
          companyEmps.filter((e) => e.dept1 === c.name).map((e) => e.employeeId)
        ).size;
      } else {
        map[c.code] = new Set(
          companyEmps
            .filter((e) => {
              if (!e.position) return false;
              const positions = e.position.split("、").map((p) => p.trim());
              return positions.includes(c.name);
            })
            .map((e) => e.employeeId)
        ).size;
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

  function buildFullCode(shortCode: string): string {
    const normalized = companyCode
      ? SHARED_GROUP_CODES.includes(companyCode)
        ? "01"
        : companyCode
      : "";
    return normalized ? normalized + shortCode : shortCode;
  }

  function startEditRow(item: CodeItem) {
    if (!user.canAccessHR) return;
    setEditRow(item.code);
    setEditCodeValue(item.code.length === 5 ? item.code.slice(2) : item.code);
    setEditNameValue(item.name);
    loadVersions(item.code);
  }

  async function saveEditRow(originalCode: string) {
    if (!/^\d{3}$/.test(editCodeValue)) {
      showToast("编号必须为3位数字", "error");
      return;
    }
    const newFullCode = buildFullCode(editCodeValue);

    if (
      newFullCode !== originalCode &&
      codes.some((c) => c.code === newFullCode)
    ) {
      showToast("编号已存在", "error");
      return;
    }

    const putRes = await fetch(apiPath, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: editCodeValue,
        name: editNameValue.trim(),
        companyCode,
        originalCode: newFullCode !== originalCode ? originalCode : undefined,
      }),
    });
    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({ error: "保存失败" }));
      showToast(err.error || "保存失败", "error");
      setEditRow(null);
      return;
    }
    setCodes((prev) =>
      prev
        .filter((c) => c.code !== originalCode)
        .concat({ code: newFullCode, name: editNameValue.trim() })
        .sort((a, b) => a.code.localeCompare(b.code))
    );
    showToast("保存成功");
    setEditRow(null);
  }

  async function doDelete(code: string) {
    const res = await fetch(`${apiPath}?code=${encodeURIComponent(code)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setCodes((prev) => prev.filter((c) => c.code !== code));
      showToast("删除成功");
    } else {
      const err = await res.json().catch(() => ({ error: "删除失败" }));
      showToast(err.error || "删除失败", "error");
    }
  }

  async function handleAdd() {
    if (!/^\d{3}$/.test(newCode)) {
      showToast("编号必须为3位数字", "error");
      return;
    }
    if (!newName.trim()) {
      showToast("名称不能为空", "error");
      return;
    }
    const fullCode = buildFullCode(newCode);
    if (codes.some((c) => c.code === fullCode)) {
      showToast("编号已存在", "error");
      return;
    }
    const body: Record<string, string> = {
      code: newCode,
      name: newName.trim(),
      companyCode,
    };
    if (departmentCode) {
      body.departmentCode = departmentCode;
    }
    const res = await fetch(apiPath, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setCodes((prev) =>
        [...prev, { code: fullCode, name: newName.trim() }].sort((a, b) =>
          a.code.localeCompare(b.code)
        )
      );
      setNewCode("");
      setNewName("");
      showToast("添加成功");
    } else {
      showToast("添加失败", "error");
    }
  }

  function getDetailList(codeItem: CodeItem): Employee[] {
    if (type === "department") {
      return employees.filter((e) => e.dept1 === codeItem.name);
    }
    return employees.filter(
      (e) => e.position && e.position.includes(codeItem.name)
    );
  }

  async function loadPositionDepts(item: CodeItem) {
    if (type !== "position") {
      setDetailModal({ open: true, code: item.code, name: item.name });
      return;
    }
    const res = await fetch(
      `/api/admin/position-codes?positionCode=${encodeURIComponent(item.code)}`
    );
    if (res.ok) {
      const data = await res.json();
      setPositionDeptModal({
        open: true,
        code: item.code,
        name: item.name,
        departments: data.departments || [],
      });
    }
  }

  async function loadVersions(entityId: string) {
    const res = await fetch(
      `/api/admin/edit-history?entityType=${entityType}&entityId=${entityId}`
    );
    if (res.ok) {
      const data = await res.json();
      setVersions(data.versions || []);
    }
  }

  async function handleSelectVersion(version: number) {
    if (!editRow) return;
    const res = await fetch(
      `/api/admin/edit-history?entityType=${entityType}&entityId=${editRow}&version=${version}`
    );
    if (res.ok) {
      const data = await res.json();
      const snapshot = JSON.parse(data.version.dataJson);
      setEditCodeValue(snapshot.code || "");
      setEditNameValue(snapshot.name || "");
      setCurrentVersion(version);
    }
  }

  async function handleSave() {
    if (!editRow) return;
    setSaving(true);
    try {
      await saveEditRow(editRow);
      setEditMode(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        {user.canAccessHR && (
          <EditToolbar
            editMode={editMode}
            onStartEdit={() => setEditMode(true)}
            onSave={handleSave}
            onCancel={() => {
              setEditRow(null);
              setEditMode(false);
            }}
            canEdit={user.canAccessHR}
            versions={versions}
            currentVersion={currentVersion}
            onSelectVersion={handleSelectVersion}
            saving={saving}
          />
        )}
      </div>

      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-center text-gray-500">加载中...</p>
        ) : (
          <table className="w-full table-fixed text-xs">
            <thead className="border-b bg-gray-50">
              <tr>
                <th
                  onClick={() => toggleSort("code")}
                  className="w-24 cursor-pointer whitespace-nowrap px-2 py-1.5 text-left font-medium text-gray-600 hover:bg-gray-100 select-none"
                >
                  <span className="flex items-center gap-1">
                    编号
                    {sortField === "code" && (
                      <span className="text-emerald-500">
                        {sortDirection === "asc" ? "↑" : "↓"}
                      </span>
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
                      <span className="text-emerald-500">
                        {sortDirection === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </span>
                </th>
                <th
                  onClick={() => toggleSort("count")}
                  className="w-16 cursor-pointer whitespace-nowrap px-2 py-1.5 text-right font-medium text-gray-600 hover:bg-gray-100 select-none"
                >
                  <span className="flex items-center justify-end gap-1">
                    人数
                    {sortField === "count" && (
                      <span className="text-emerald-500">
                        {sortDirection === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const bioCodes = sortedCodes.filter((c) =>
                  BIO_GROUP_CODES.includes(c.code.slice(0, 2))
                );
                const pharmaCodes = sortedCodes.filter(
                  (c) => c.code.slice(0, 2) === PHARMA_CODE
                );
                const bioTotal = bioCodes.reduce(
                  (sum, c) => sum + (stats[c.code] || 0),
                  0
                );
                const pharmaTotal = pharmaCodes.reduce(
                  (sum, c) => sum + (stats[c.code] || 0),
                  0
                );
                const grandTotal = sortedCodes.reduce(
                  (sum, c) => sum + (stats[c.code] || 0),
                  0
                );
                const renderRow = (item: CodeItem) => {
                  const isEditing = editRow === item.code;
                  const count = stats[item.code] || 0;
                  const isSelected = selectedCode === item.code;
                  return (
                    <tr
                      key={item.code}
                      className={`border-b last:border-0 hover:bg-gray-50 ${isSelected ? "bg-emerald-50" : ""}`}
                    >
                      <td className="whitespace-nowrap px-2 py-1.5 text-gray-700">
                        {isEditing ? (
                          <input
                            value={editCodeValue}
                            onChange={(e) =>
                              setEditCodeValue(e.target.value)
                            }
                            className="w-full rounded border border-emerald-400 px-1 py-0.5 text-xs focus:outline-none"
                          />
                        ) : (
                          <span
                            className={
                              onSelect
                                ? "cursor-pointer hover:text-emerald-600"
                                : ""
                            }
                            onClick={() => {
                              if (onSelect) onSelect(item.code);
                            }}
                          >
                            {item.code}
                            {editMode && user.canAccessHR && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteCode(item.code);
                                }}
                                className="ml-0.5 text-red-500 hover:text-red-700"
                                title="删除"
                              >
                                ×
                              </button>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-gray-700">
                        {isEditing ? (
                          <input
                            value={editNameValue}
                            onChange={(e) =>
                              setEditNameValue(e.target.value)
                            }
                            className="w-full rounded border border-emerald-400 px-1 py-0.5 text-xs focus:outline-none"
                          />
                        ) : (
                          <span
                            className="cursor-pointer hover:text-emerald-600"
                            onClick={() =>
                              editMode && user.canAccessHR
                                ? startEditRow(item)
                                : onSelect
                                  ? onSelect(item.code)
                                  : type === "position"
                                    ? loadPositionDepts(item)
                                    : setDetailModal({
                                        open: true,
                                        code: item.code,
                                        name: item.name,
                                      })
                            }
                          >
                            {item.name || "-"}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right text-gray-700">
                        <span
                          className="cursor-pointer rounded-full bg-gray-100 px-2 py-0.5 text-xs hover:bg-gray-200"
                          onClick={() =>
                            setDetailModal({
                              open: true,
                              code: item.code,
                              name: item.name,
                            })
                          }
                        >
                          {count}
                        </span>
                      </td>
                    </tr>
                  );
                };
                return (
                  <>
                    {bioCodes.length > 0 && (
                      <>
                        <tr className="bg-gray-100">
                          <td
                            colSpan={3}
                            className="px-2 py-1 font-medium text-gray-600"
                          >
                            丰华生物体系
                          </td>
                        </tr>
                        {bioCodes.map(renderRow)}
                        <tr className="border-b bg-gray-50">
                          <td className="px-2 py-1.5" />
                          <td className="whitespace-nowrap px-2 py-1.5 text-right font-medium text-gray-600">
                            小计
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right">
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              {bioTotal}
                            </span>
                          </td>
                        </tr>
                      </>
                    )}
                    {pharmaCodes.length > 0 && (
                      <>
                        <tr className="bg-gray-100">
                          <td
                            colSpan={3}
                            className="px-2 py-1 font-medium text-gray-600"
                          >
                            丰华制药
                          </td>
                        </tr>
                        {pharmaCodes.map(renderRow)}
                        <tr className="border-b bg-gray-50">
                          <td className="px-2 py-1.5" />
                          <td className="whitespace-nowrap px-2 py-1.5 text-right font-medium text-gray-600">
                            小计
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right">
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              {pharmaTotal}
                            </span>
                          </td>
                        </tr>
                      </>
                    )}
                    <tr className="bg-gray-100">
                      <td className="px-2 py-1.5" />
                      <td className="whitespace-nowrap px-2 py-1.5 text-right font-bold text-gray-700">
                        合计
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right">
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                          {grandTotal}
                        </span>
                      </td>
                    </tr>
                    {editMode && user.canAccessHR && (
                      <tr className="border-b last:border-0 bg-gray-50">
                        <td className="whitespace-nowrap px-2 py-1.5">
                          <input
                            type="text"
                            value={newCode}
                            onChange={(e) => setNewCode(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleAdd();
                            }}
                            placeholder="如001"
                            className="w-full rounded border border-gray-300 px-1 py-0.5 text-xs focus:border-emerald-400 focus:outline-none"
                          />
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5">
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={newName}
                              onChange={(e) => setNewName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleAdd();
                              }}
                              placeholder="名称"
                              className="w-full rounded border border-gray-300 px-1 py-0.5 text-xs focus:border-emerald-400 focus:outline-none"
                            />
                            <button
                              onClick={handleAdd}
                              className="rounded-md bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-700"
                            >
                              添加
                            </button>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-gray-400">
                          -
                        </td>
                      </tr>
                    )}
                  </>
                );
              })()}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmModal
        open={!!deleteCode}
        title="删除确认"
        message="确定删除该编码？"
        confirmLabel="确定"
        onConfirm={() => {
          if (deleteCode) {
            doDelete(deleteCode);
            setDeleteCode(null);
          }
        }}
        onCancel={() => setDeleteCode(null)}
      />
      <Toast
        message={toast?.message || ""}
        type={toast?.type as any}
        show={!!toast}
        onClose={closeToast}
      />

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
              const list = getDetailList({
                code: detailModal.code,
                name: detailModal.name,
              });
              if (list.length === 0) {
                return <p className="text-sm text-gray-500">暂无人员</p>;
              }
              return (
                <table className="w-full text-xs">
                  <thead className="border-b bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">
                        姓名
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">
                        部门
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">
                        岗位
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((emp) => (
                      <tr
                        key={emp.id}
                        className="border-b last:border-0 hover:bg-gray-50"
                      >
                        <td className="px-3 py-2 text-gray-700">{emp.name}</td>
                        <td className="px-3 py-2 text-gray-700">
                          {emp.dept1 || "-"}
                        </td>
                        <td className="px-3 py-2 text-gray-700">
                          {emp.position || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
          </div>
        </div>
      )}

      {positionDeptModal?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">
                {positionDeptModal.name} — 所属部门
              </h3>
              <button
                onClick={() => setPositionDeptModal(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            {positionDeptModal.departments.length === 0 ? (
              <p className="text-sm text-gray-500">暂无关联部门</p>
            ) : (
              <ul className="space-y-2">
                {positionDeptModal.departments.map((dept) => (
                  <li
                    key={dept}
                    className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700"
                  >
                    {dept}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
