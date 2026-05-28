"use client";

import { useEffect, useState, useCallback } from "react";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";

interface EntryItem {
  id: number;
  employeeId: number;
  employeeName: string;
  projectId: number;
  projectName: string;
  role: string | null;
  startDate: string | null;
  endDate: string | null;
}

interface ProjectItem {
  id: number;
  name: string;
}

import type { HRUser as User } from "../types";

export default function ProjectInfoTab({ user: _user }: { user: User }) {
  const [entries, setEntries] = useState<EntryItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editEmpId, setEditEmpId] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const { toast, showToast, closeToast } = useToast();

  useEffect(() => {
    fetch("/api/hr/projects")
      .then((r) => r.json())
      .then((d) => setProjects(d.projects || []));
  }, []);

  const loadEntries = useCallback(async () => {
    if (!selectedProject) return;
    setLoading(true);
    const res = await fetch(`/api/hr/employee-projects?projectId=${selectedProject}`);
    const data = await res.json();
    setEntries(data.entries || []);
    setLoading(false);
  }, [selectedProject]);

  useEffect(() => {
    if (selectedProject) loadEntries();
  }, [selectedProject, loadEntries]);

  function startCreate() {
    setEditId(null);
    setEditEmpId("");
    setEditRole("");
    setEditStart("");
    setEditEnd("");
    setEditing(true);
  }

  function startEdit(e: EntryItem) {
    setEditId(e.id);
    setEditEmpId(String(e.employeeId));
    setEditRole(e.role || "");
    setEditStart(e.startDate || "");
    setEditEnd(e.endDate || "");
    setEditing(true);
  }

  async function save() {
    if (!editEmpId.trim()) { showToast("员工编号不能为空", "error"); return; }
    if (!selectedProject) { showToast("请先选择项目", "error"); return; }

    const body: Record<string, unknown> = {
      employeeId: editEmpId.trim(),
      projectId: selectedProject,
      role: editRole.trim() || null,
      startDate: editStart || null,
      endDate: editEnd || null,
    };

    const url = editId ? `/api/hr/employee-projects/${editId}` : "/api/hr/employee-projects";
    const method = editId ? "PUT" : "POST";

    // PUT doesn't need employeeId/projectId (they're immutable)
    const putBody = editId
      ? { role: editRole.trim() || null, startDate: editStart || null, endDate: editEnd || null }
      : body;

    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(putBody) });
    if (res.ok) {
      setEditing(false);
      loadEntries();
    } else {
      const err = await res.json();
      showToast(err.error || "保存失败", "error");
    }
  }


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">项目信息</h2>
        {selectedProject && !editing && (
          <button onClick={startCreate} className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700">
            添加人员
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-600">选择项目：</label>
        <select
          value={selectedProject || ""}
          onChange={(e) => { const v = parseInt(e.target.value); setSelectedProject(v || null); }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
        >
          <option value="">请选择项目</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {editing && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <input value={editEmpId} onChange={(e) => setEditEmpId(e.target.value)} placeholder="员工编号" disabled={!!editId} className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none disabled:bg-gray-100" />
            <input value={editRole} onChange={(e) => setEditRole(e.target.value)} placeholder="项目角色" className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
            <input value={editStart} onChange={(e) => setEditStart(e.target.value)} placeholder="开始日期" className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
            <input value={editEnd} onChange={(e) => setEditEnd(e.target.value)} placeholder="结束日期" className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={save} className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700">保存</button>
            <button onClick={() => setEditing(false)} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">取消</button>
          </div>
        </div>
      )}

      {!selectedProject ? (
        <p className="p-8 text-center text-gray-400">请先选择一个项目</p>
      ) : loading ? (
        <p className="p-8 text-center text-gray-500">加载中...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">员工编号</th>
                <th className="px-4 py-3 text-left font-medium">姓名</th>
                <th className="px-4 py-3 text-left font-medium">角色</th>
                <th className="px-4 py-3 text-left font-medium">开始日期</th>
                <th className="px-4 py-3 text-left font-medium">结束日期</th>
                <th className="px-4 py-3 text-left font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-gray-900">{e.employeeId}</td>
                  <td className="px-4 py-3 text-gray-900">{e.employeeName}</td>
                  <td className="px-4 py-3 text-gray-600">{e.role || "-"}</td>
                  <td className="px-4 py-3 text-gray-600">{e.startDate || "-"}</td>
                  <td className="px-4 py-3 text-gray-600">{e.endDate || "-"}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => startEdit(e)} className="text-emerald-600 hover:text-emerald-800">编辑</button>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">暂无人员分配</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}


      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
    </div>
  );
}
