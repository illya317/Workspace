"use client";

import { useEffect, useState } from "react";
import ConfirmModal from "@/app/components/ConfirmModal";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";

interface ProjectItem {
  id: number;
  name: string;
  type: string;
  description: string | null;
  departments: Array<{ department: { id: number; name: string } }>;
  _count: { employees: number };
}

interface Department {
  id: number;
  name: string;
  company: string;
}

interface User {
  id: number;
  name: string;
  canAccessHR: boolean;
  isWorkListAdmin: boolean;
}

export default function ProjectTab({ user }: { user: User }) {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("project");
  const [editDeptIds, setEditDeptIds] = useState<number[]>([]);
  const [editDesc, setEditDesc] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const { toast, showToast, closeToast } = useToast();

  async function load() {
    const [pRes, dRes] = await Promise.all([
      fetch("/api/projects"),
      fetch("/api/admin/departments"),
    ]);
    const pData = await pRes.json();
    const dData = await dRes.json();
    setProjects(pData.projects || []);
    setDepartments(dData.departments || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function startCreate() {
    setEditId(null);
    setEditName("");
    setEditType("project");
    setEditDeptIds([]);
    setEditDesc("");
    setEditing(true);
  }

  function startEdit(p: ProjectItem) {
    setEditId(p.id);
    setEditName(p.name);
    setEditType(p.type);
    setEditDeptIds(p.departments?.map((d) => d.department.id) || []);
    setEditDesc(p.description || "");
    setEditing(true);
  }

  async function save() {
    if (!editName.trim()) { showToast("名称不能为空", "error"); return; }
    const body: Record<string, unknown> = {
      name: editName.trim(),
      type: editType,
      departmentIds: editDeptIds,
      description: editDesc.trim() || null,
    };
    const url = editId ? `/api/projects/${editId}` : "/api/projects";
    const method = editId ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) {
      setEditing(false);
      load();
    } else {
      const err = await res.json();
      showToast(err.error || "保存失败", "error");
    }
  }

  async function deleteProject(id: number) {
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (res.ok) {
      setConfirmDelete(null);
      load();
    } else {
      showToast("删除失败", "error");
    }
  }

  if (loading) return <p className="p-8 text-center text-gray-500">加载中...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">项目管理</h2>
        {!editing && (
          <button onClick={startCreate} className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700">
            新增项目
          </button>
        )}
      </div>

      {editing && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="项目名称" className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
            <select value={editType} onChange={(e) => setEditType(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none">
              <option value="project">项目</option>
              <option value="department">部门</option>
            </select>
            <div className="flex flex-wrap gap-1 items-center rounded-md border border-gray-300 px-2 py-1 min-h-[38px]">
              {departments.filter(d => editDeptIds.includes(d.id)).map(d => (
                <span key={d.id} className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                  {d.name}
                  <button onClick={() => setEditDeptIds(editDeptIds.filter(id => id !== d.id))} className="text-gray-400 hover:text-red-500">×</button>
                </span>
              ))}
              <select
                value=""
                onChange={(e) => { const id = parseInt(e.target.value); if (id && !editDeptIds.includes(id)) setEditDeptIds([...editDeptIds, id]); }}
                className="flex-1 border-none bg-transparent px-1 py-1 text-sm focus:outline-none min-w-[120px]"
              >
                <option value="">+ 关联部门</option>
                {departments.filter(d => !editDeptIds.includes(d.id)).map((d) => <option key={d.id} value={d.id}>{d.company} - {d.name}</option>)}
              </select>
            </div>
            <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="说明（可选）" className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={save} className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700">保存</button>
            <button onClick={() => setEditing(false)} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">取消</button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">名称</th>
              <th className="px-4 py-3 text-left font-medium">类型</th>
              <th className="px-4 py-3 text-left font-medium">关联部门</th>
              <th className="px-4 py-3 text-left font-medium">人数</th>
              <th className="px-4 py-3 text-left font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {projects.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                <td className="px-4 py-3 text-gray-600">{p.type === "department" ? "部门" : "项目"}</td>
                <td className="px-4 py-3 text-gray-600">{p.departments?.map(d => d.department.name).join("、") || "-"}</td>
                <td className="px-4 py-3 text-gray-600">{p._count.employees}</td>
                <td className="px-4 py-3">
                  <button onClick={() => startEdit(p)} className="mr-2 text-emerald-600 hover:text-emerald-800">编辑</button>
                  <button onClick={() => setConfirmDelete(p.id)} className="text-red-500 hover:text-red-700">删除</button>
                </td>
              </tr>
            ))}
            {projects.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">暂无项目</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={!!confirmDelete}
        title="确认删除"
        message="删除项目不会删除关联的员工分配数据"
        onConfirm={async () => { deleteProject(confirmDelete!); }}
        onCancel={() => setConfirmDelete(null)}
      />
      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
    </div>
  );
}
