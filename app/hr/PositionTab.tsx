"use client";

import { useEffect, useState, useRef } from "react";

interface User {
  id: number;
  name: string;
  canAccessHR: boolean;
  isWorkListAdmin: boolean;
  company?: string | null;
}

interface PositionRow {
  id: number;
  employeeId: string;
  name: string;
  company: string;
  center: string;
  dept1: string;
  position: string;
  isPrimary: boolean;
  status?: string;
}

const FIELDS = [
  { key: "employeeId", label: "ID", editable: false },
  { key: "name", label: "姓名", editable: false },
  { key: "company", label: "公司", editable: true },
  { key: "center", label: "中心", editable: true },
  { key: "dept1", label: "一级部门", editable: true },
  { key: "position", label: "岗位", editable: true },
  { key: "isPrimary", label: "主岗", editable: true },
];

export default function PositionTab({ user, selectedCompany }: { user: User; selectedCompany: string }) {
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [allDepts, setAllDepts] = useState<string[]>([]);
  const [allPositions, setAllPositions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [editingCell, setEditingCell] = useState<{ id: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editBool, setEditBool] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [saveTip, setSaveTip] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; row: PositionRow | null }>({ open: false, row: null });

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedCompany) params.set("company", selectedCompany);
    if (keyword) params.set("keyword", keyword);
    const res = await fetch(`/api/employee-positions?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setPositions(data.positions || []);
    }
    // 加载部门和岗位下拉选项
    const [deptRes, posRes] = await Promise.all([
      fetch(`/api/employees/autocomplete?type=dept`),
      fetch(`/api/employees/autocomplete?type=position`),
    ]);
    if (deptRes.ok) {
      const d = await deptRes.json();
      setAllDepts(d.items || []);
    }
    if (posRes.ok) {
      const p = await posRes.json();
      setAllPositions(p.items || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [selectedCompany, keyword]);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  function startEdit(row: PositionRow, field: string) {
    if (!user.isWorkListAdmin || !editMode) return;
    const f = FIELDS.find((x) => x.key === field);
    if (!f?.editable) return;
    setEditingCell({ id: row.id, field });
    if (field === "isPrimary") {
      setEditBool((row as any)[field] === true);
    } else {
      setEditValue((row as any)[field] || "");
    }
  }

  async function saveEdit() {
    if (!editingCell) return;
    const { id, field } = editingCell;
    const value = field === "isPrimary" ? editBool : editValue;
    const res = await fetch(`/api/employee-positions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field, value }),
    });
    if (res.ok) {
      setPositions((prev) =>
        prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
      );
      setSaveTip("保存成功");
      setTimeout(() => setSaveTip(""), 1500);
    } else {
      const err = await res.json().catch(() => ({ error: "保存失败" }));
      setSaveTip(err.error || "保存失败");
      setTimeout(() => setSaveTip(""), 3000);
    }
    setEditingCell(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") saveEdit();
    if (e.key === "Escape") setEditingCell(null);
  }

  const sorted = [...positions].sort((a, b) => a.employeeId.localeCompare(b.employeeId));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-4 shadow-sm">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") load(); }}
          placeholder="姓名筛选"
          className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-emerald-400 focus:outline-none"
        />
        <button
          onClick={() => { setKeyword(""); load(); }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          重置
        </button>
        {user.isWorkListAdmin && (
          <div className="flex gap-2">
            {editMode && (
              <button
                onClick={() => { if (editingCell) saveEdit(); }}
                className="rounded-md bg-green-500 px-3 py-2 text-sm text-white hover:bg-green-600"
              >
                保存
              </button>
            )}
            <button
              onClick={() => { setEditMode((v) => !v); setEditingCell(null); }}
              className={`rounded-md px-3 py-2 text-sm ${editMode ? "bg-amber-100 text-amber-700 border border-amber-300" : "border border-gray-300 text-gray-600 hover:bg-gray-50"}`}
            >
              {editMode ? "退出编辑" : "编辑"}
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-center text-gray-500">加载中...</p>
        ) : positions.length === 0 ? (
          <p className="p-8 text-center text-gray-500">暂无数据</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b bg-gray-50">
              <tr>
                {FIELDS.map((f) => (
                  <th key={f.key} className="whitespace-nowrap px-3 py-2 text-left font-medium text-gray-600">
                    {f.label}
                  </th>
                ))}
                {editMode && user.isWorkListAdmin && <th className="whitespace-nowrap px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.id} className="border-b last:border-0 hover:bg-gray-50">
                  {FIELDS.map((f) => {
                    const isEditing = editingCell?.id === row.id && editingCell?.field === f.key;
                    const val = (row as any)[f.key];
                    if (isEditing && f.key === "isPrimary") {
                      return (
                        <td key={f.key} className="whitespace-nowrap px-3 py-2">
                          <input
                            type="checkbox"
                            checked={editBool}
                            onChange={(e) => setEditBool(e.target.checked)}
                            onBlur={() => saveEdit()}
                            className="h-4 w-4 rounded border-emerald-400 text-emerald-600"
                          />
                        </td>
                      );
                    }
                    if (isEditing && (f.key === "dept1" || f.key === "position")) {
                      const options = f.key === "dept1" ? allDepts : allPositions;
                      return (
                        <td key={f.key} className="whitespace-nowrap px-3 py-2">
                          <div className="flex items-center gap-1">
                            <input
                              ref={inputRef}
                              list={f.key === "dept1" ? "dept-list" : "pos-list"}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => saveEdit()}
                              onKeyDown={handleKeyDown}
                              className="rounded border border-emerald-400 px-2 py-1 text-xs focus:outline-none"
                              style={{ minWidth: "12ch" }}
                            />
                            <button
                              onMouseDown={(e) => { e.preventDefault(); saveEdit(); }}
                              className="rounded bg-green-500 px-1.5 py-0.5 text-[10px] text-white hover:bg-green-600"
                            >
                              保存
                            </button>
                          </div>
                          <datalist id={f.key === "dept1" ? "dept-list" : "pos-list"}>
                            {options.map((o) => (
                              <option key={o} value={o} />
                            ))}
                          </datalist>
                        </td>
                      );
                    }
                    if (isEditing) {
                      return (
                        <td key={f.key} className="whitespace-nowrap px-3 py-2">
                          <div className="flex items-center gap-1">
                            <input
                              ref={inputRef}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => saveEdit()}
                              onKeyDown={handleKeyDown}
                              className="rounded border border-emerald-400 px-2 py-1 text-xs focus:outline-none"
                              style={{ minWidth: val ? `${String(val).length + 4}ch` : "8ch" }}
                            />
                            <button
                              onMouseDown={(e) => { e.preventDefault(); saveEdit(); }}
                              className="rounded bg-green-500 px-1.5 py-0.5 text-[10px] text-white hover:bg-green-600"
                            >
                              保存
                            </button>
                          </div>
                        </td>
                      );
                    }
                    return (
                      <td
                        key={f.key}
                        onClick={() => startEdit(row, f.key)}
                        className={`whitespace-nowrap px-3 py-2 text-gray-700 ${editMode && f.editable && user.isWorkListAdmin ? "cursor-pointer hover:bg-emerald-50" : ""}`}
                      >
                        {f.key === "isPrimary" ? (val ? "是" : "否") : (val || "-")}
                      </td>
                    );
                  })}
                  {editMode && user.isWorkListAdmin && (
                    <td className="whitespace-nowrap px-3 py-2">
                      <button
                        onClick={() => setConfirmModal({ open: true, row })}
                        className="text-red-500 hover:text-red-700"
                        title="删除"
                      >
                        ×
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 删除确认弹窗 */}
      {confirmModal.open && confirmModal.row && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-gray-800">删除确认</h3>
            <p className="mb-6 text-sm text-gray-600">
              确定删除 {confirmModal.row.name}（{confirmModal.row.employeeId}）的该岗位信息？
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmModal({ open: false, row: null })}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  const row = confirmModal.row!;
                  const res = await fetch(`/api/employee-positions/${row.id}`, { method: "DELETE" });
                  if (res.ok) {
                    setPositions((prev) => prev.filter((p) => p.id !== row.id));
                    setSaveTip("删除成功");
                    setTimeout(() => setSaveTip(""), 1500);
                  } else {
                    setSaveTip("删除失败");
                    setTimeout(() => setSaveTip(""), 2000);
                  }
                  setConfirmModal({ open: false, row: null });
                }}
                className="rounded-md bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
