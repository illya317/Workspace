"use client";

import { useEffect, useState, useRef } from "react";
import EditToolbar from "@/app/components/EditToolbar";

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
  alias?: string | null;
  gender?: string | null;
  ethnicity?: string | null;
  hometown?: string | null;
  politics?: string | null;
  education?: string | null;
  title?: string | null;
  school?: string | null;
  major?: string | null;
  majorRelevant?: string | null;
  phone?: string | null;
  office1?: string | null;
  office2?: string | null;
  office3?: string | null;
  attendance1?: string | null;
  attendance2?: string | null;
  joinDate?: string | null;
  nature?: string | null;
  status?: string | null;
  leaveDate?: string | null;
}

const BASIC_FIELDS = [
  { key: "employeeId", label: "ID" },
  { key: "name", label: "姓名" },
  { key: "alias", label: "别名" },
  { key: "gender", label: "性别" },
  { key: "ethnicity", label: "民族" },
  { key: "hometown", label: "籍贯" },
  { key: "politics", label: "政治面貌" },
  { key: "education", label: "学历" },
  { key: "title", label: "职称" },
  { key: "school", label: "毕业院校" },
  { key: "major", label: "专业" },
  { key: "majorRelevant", label: "是否相关专业" },
  { key: "phone", label: "电话" },
  { key: "office1", label: "办公区1" },
  { key: "office2", label: "办公区2" },
  { key: "office3", label: "办公区3" },
  { key: "attendance1", label: "考勤1" },
  { key: "attendance2", label: "考勤2" },
  { key: "joinDate", label: "进司时间" },
  { key: "nature", label: "性质" },
  { key: "status", label: "状态" },
  { key: "leaveDate", label: "离职日期" },
];

export default function EmployeeTab({ user, selectedCompany }: { user: User; selectedCompany: string }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [editingCell, setEditingCell] = useState<{ id: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [saveTip, setSaveTip] = useState("");
  const [rosterFilter, setRosterFilter] = useState<"在职" | "离职">("在职");
  const [editMode, setEditMode] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; emp: Employee | null }>({ open: false, emp: null });
  const [saving, setSaving] = useState(false);
  const [versions, setVersions] = useState<Array<{ version: number; createdAt: string }>>([]);
  const [currentVersion, setCurrentVersion] = useState<number | undefined>(undefined);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedCompany) params.set("company", selectedCompany);
    if (keyword) params.set("keyword", keyword);
    params.set("status", rosterFilter);
    const res = await fetch(`/api/employees?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      const seen = new Set();
      const unique = (data.employees || []).filter((e: Employee) => {
        if (seen.has(e.employeeId)) return false;
        seen.add(e.employeeId);
        return true;
      });
      setEmployees(unique);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [selectedCompany, rosterFilter, keyword]);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  function startEdit(emp: Employee, field: string) {
    if (!user.canAccessHR || !editMode) return;
    setEditingCell({ id: emp.id, field });
    setEditValue((emp as any)[field] || "");
    loadVersions(emp.id);
  }

  async function loadVersions(entityId: number) {
    const res = await fetch(`/api/admin/edit-history?entityType=employee&entityId=${entityId}`);
    if (res.ok) {
      const data = await res.json();
      setVersions(data.versions || []);
    }
  }

  async function handleSelectVersion(version: number) {
    if (!editingCell) return;
    const res = await fetch(`/api/admin/edit-history?entityType=employee&entityId=${editingCell.id}&version=${version}`);
    if (res.ok) {
      const data = await res.json();
      const snapshot = JSON.parse(data.version.dataJson);
      setEditValue(snapshot[editingCell.field] || "");
      setCurrentVersion(version);
    }
  }

  async function handleSave() {
    if (!editingCell) return;
    setSaving(true);
    const cellId = editingCell.id;
    try {
      await saveEdit();
      setEditMode(false);
      loadVersions(cellId);
    } finally {
      setSaving(false);
    }
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
      setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, [field]: editValue || null } : e)));
      setSaveTip("保存成功");
      setTimeout(() => setSaveTip(""), 1500);
    } else {
      const err = await res.json().catch(() => ({ error: "保存失败" }));
      setSaveTip(err.error || "保存失败");
      setTimeout(() => setSaveTip(""), 2000);
    }
    setEditingCell(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") saveEdit();
    if (e.key === "Escape") setEditingCell(null);
  }

  const sortedEmployees = [...employees].sort((a, b) => a.employeeId.localeCompare(b.employeeId));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-4 shadow-sm">
        <div className="flex rounded-md border border-gray-200 overflow-hidden">
          <button
            onClick={() => setRosterFilter("在职")}
            className={`px-3 py-1.5 text-sm ${rosterFilter === "在职" ? "bg-emerald-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            在职
          </button>
          <button
            onClick={() => setRosterFilter("离职")}
            className={`px-3 py-1.5 text-sm ${rosterFilter === "离职" ? "bg-emerald-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            离职
          </button>
        </div>
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") load(); }}
          placeholder="姓名筛选"
          className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-emerald-400 focus:outline-none"
        />
        <button
          onClick={() => { setKeyword(""); setRosterFilter("在职"); load(); }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          重置
        </button>
        {user.canAccessHR && (
          <EditToolbar
            editMode={editMode}
            onStartEdit={() => setEditMode(true)}
            onSave={handleSave}
            onCancel={() => { setEditMode(false); setEditingCell(null); }}
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
        ) : employees.length === 0 ? (
          <p className="p-8 text-center text-gray-500">暂无数据</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b bg-gray-50">
              <tr>
                {BASIC_FIELDS.map((f) => (
                  <th key={f.key} className="whitespace-nowrap px-3 py-2 text-left font-medium text-gray-600">
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedEmployees.map((emp) => (
                <tr key={emp.id} className={`border-b last:border-0 hover:bg-gray-50 ${emp.status === "离职" ? "bg-gray-100" : ""}`}>
                  {BASIC_FIELDS.map((f) => {
                    const isEditing = editingCell?.id === emp.id && editingCell?.field === f.key;
                    const val = (emp as any)[f.key] || "";
                    return (
                      <td
                        key={f.key}
                        onClick={() => startEdit(emp, f.key)}
                        className={`whitespace-nowrap px-3 py-2 text-gray-700 ${editMode && user.canAccessHR ? "cursor-pointer hover:bg-emerald-50" : ""}`}
                      >
                        {isEditing ? (
                          <input
                            ref={inputRef}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => saveEdit()}
                            onKeyDown={handleKeyDown}
                            className="rounded border border-emerald-400 px-2 py-1 text-xs focus:outline-none"
                            style={{ minWidth: val ? `${String(val).length + 4}ch` : "8ch" }}
                          />
                        ) : f.key === "employeeId" && editMode && user.canAccessHR ? (
                          <span className="inline-flex items-center gap-1">
                            {val || "-"}
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmModal({ open: true, emp }); }}
                              className="ml-1 text-red-500 hover:text-red-700 font-bold"
                              title="标记离职"
                            >
                              ×
                            </button>
                          </span>
                        ) : (
                          val || "-"
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 离职确认弹窗 */}
      {confirmModal.open && confirmModal.emp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-gray-800">确认离职</h3>
            <p className="mb-6 text-sm text-gray-600">
              确定将 {confirmModal.emp.name}（{confirmModal.emp.employeeId}）标记为离职？
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmModal({ open: false, emp: null })}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  const emp = confirmModal.emp!;
                  const res = await fetch(`/api/employees/${emp.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ field: "status", value: "离职" }),
                  });
                  if (res.ok) {
                    setEmployees((prev) =>
                      prev.map((e) => (e.id === emp.id ? { ...e, status: "离职" } : e))
                    );
                    setSaveTip("已标记离职");
                    setTimeout(() => setSaveTip(""), 1500);
                  } else {
                    setSaveTip("操作失败");
                    setTimeout(() => setSaveTip(""), 2000);
                  }
                  setConfirmModal({ open: false, emp: null });
                }}
                className="rounded-md bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600"
              >
                确认离职
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
