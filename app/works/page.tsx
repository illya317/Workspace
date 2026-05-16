"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import UserMenu from "@/app/components/UserMenu";
import NavLink from "@/app/components/NavLink";
import DepartmentSwitcher from "@/app/components/DepartmentSwitcher";

interface WorkParticipant {
  id: number;
  workItemId: number;
  name: string;
  wxUserId: string | null;
  createdAt: string;
}

interface WorkItem {
  id: number;
  departmentId: number;
  category: string;
  content: string;
  importance: number;
  urgency: number;
  isArchived: boolean;
  participants: WorkParticipant[];
  sortOrder: number;
  createdAt: string;
}

interface User {
  id: number;
  name: string;
  departmentId: number;
  departmentName?: string | null;
  isWorkListAdmin: boolean;
}

function StarRating({
  value,
  onChange,
  readOnly,
  label,
}: {
  value: number;
  onChange?: (v: number) => void;
  readOnly?: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">{label}</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            disabled={readOnly}
            onClick={() => onChange?.(s)}
            className={`text-sm ${
              s <= value ? "text-amber-400" : "text-gray-300"
            } ${readOnly ? "" : "cursor-pointer hover:text-amber-500"}`}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

function WorkCard({
  work,
  isAdmin,
  onEdit,
  onDelete,
  onMove,
  onArchive,
  onRestore,
  isFirst,
  isLast,
}: {
  work: WorkItem;
  isAdmin: boolean;
  onEdit: (w: WorkItem) => void;
  onDelete: (id: number) => void;
  onMove: (id: number, direction: number) => void;
  onArchive?: (id: number) => void;
  onRestore?: (id: number) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-start justify-between">
        <h4 className="text-sm font-semibold text-gray-800">{work.content}</h4>
        {isAdmin && (
          <div className="flex items-center gap-1">
            {!work.isArchived && (
              <>
                <button
                  type="button"
                  onClick={() => onMove(work.id, -1)}
                  disabled={isFirst}
                  className="rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => onMove(work.id, 1)}
                  disabled={isLast}
                  className="rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(work)}
                  className="rounded px-1.5 py-0.5 text-xs text-emerald-600 hover:bg-emerald-50"
                >
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() => onArchive?.(work.id)}
                  className="rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100"
                >
                  归档
                </button>
              </>
            )}
            {work.isArchived && (
              <button
                type="button"
                onClick={() => onRestore?.(work.id)}
                className="rounded px-1.5 py-0.5 text-xs text-emerald-600 hover:bg-emerald-50"
              >
                恢复
              </button>
            )}
            <button
              type="button"
              onClick={() => onDelete(work.id)}
              className="rounded px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-50"
            >
              删除
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <StarRating value={work.importance} readOnly label="重要度" />
        <StarRating value={work.urgency} readOnly label="紧急度" />
      </div>
      {work.participants.length > 0 && (
        <div className="mt-2 text-xs text-gray-500">
          参与人：{work.participants.map((p) => p.name).join("、")}
        </div>
      )}
      <div className="mt-1 text-xs text-gray-400">
        创建于 {new Date(work.createdAt).toLocaleDateString("zh-CN")}
      </div>
    </div>
  );
}

function WorkForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: WorkItem | null;
  onSave: (data: {
    category: string;
    content: string;
    importance: number;
    urgency: number;
    participants: string;
    sortOrder: number;
  }) => void;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState(initial?.category || "routine");
  const [content, setContent] = useState(initial?.content || "");
  const [importance, setImportance] = useState(initial?.importance || 3);
  const [urgency, setUrgency] = useState(initial?.urgency || 3);
  const [participants, setParticipants] = useState(
    initial?.participants?.map((p) => p.name).join(",") || ""
  );

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-gray-600">类别</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-emerald-400 focus:outline-none"
          >
            <option value="routine">日常工作</option>
            <option value="non-routine">其他工作</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-600">
            工作内容 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-emerald-400 focus:outline-none"
            placeholder="例如：会议纪要整理"
          />
        </div>
        <div className="flex flex-wrap gap-4">
          <StarRating
            value={importance}
            onChange={setImportance}
            label="重要度"
          />
          <StarRating value={urgency} onChange={setUrgency} label="紧急度" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-600">参与人</label>
          <input
            type="text"
            value={participants}
            onChange={(e) => setParticipants(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-emerald-400 focus:outline-none"
            placeholder="多个名字用逗号分隔"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              onSave({
                category,
                content,
                importance,
                urgency,
                participants,
                sortOrder: initial?.sortOrder ?? 0,
              })
            }
            disabled={!content.trim()}
            className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {initial ? "保存" : "添加"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  count,
  expanded,
  onToggle,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-800"
    >
      <span
        className={`text-xs transition-transform ${expanded ? "rotate-90" : ""}`}
      >
        ▶
      </span>
      {title}
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
        {count}
      </span>
    </button>
  );
}

export default function WorksPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingWork, setEditingWork] = useState<WorkItem | null>(null);

  const [routineExpanded, setRoutineExpanded] = useState(true);
  const [nonRoutineExpanded, setNonRoutineExpanded] = useState(true);
  const [archivedExpanded, setArchivedExpanded] = useState(false);

  const [toast, setToast] = useState<{ show: boolean; message: string }>({
    show: false,
    message: "",
  });

  function showToast(message: string) {
    setToast({ show: true, message });
    setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 3000);
  }

  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: (() => void) | null;
  }>({ show: false, title: "", message: "", onConfirm: null });

  function openConfirm(title: string, message: string, onConfirm: () => void) {
    setConfirmModal({ show: true, title, message, onConfirm });
  }

  function closeConfirm() {
    setConfirmModal({ show: false, title: "", message: "", onConfirm: null });
  }

  useEffect(() => {
    fetchUser();
  }, []);

  async function fetchUser() {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      setUser(data.user);
      await fetchWorks();
    } catch {
      router.push("/login");
    }
  }

  async function fetchWorks() {
    const selectedDept = typeof window !== "undefined" ? localStorage.getItem("selectedDeptId") : null;
    const deptParam = selectedDept ? `&deptId=${selectedDept}` : "";
    const res = await fetch(`/api/works?includeArchived=true${deptParam}`);
    const data = await res.json();
    setWorks(data.works || []);
    setLoading(false);
  }

  async function handleCreate(data: {
    category: string;
    content: string;
    importance: number;
    urgency: number;
    participants: string;
    sortOrder: number;
  }) {
    const selectedDept = typeof window !== "undefined" ? localStorage.getItem("selectedDeptId") : null;
    const body = selectedDept ? { ...data, deptId: parseInt(selectedDept) } : data;
    const res = await fetch("/api/works", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setShowForm(false);
      fetchWorks();
    } else {
      const err = await res.json();
      showToast(err.error || "添加失败");
    }
  }

  async function handleUpdate(data: {
    category: string;
    content: string;
    importance: number;
    urgency: number;
    participants: string;
    sortOrder: number;
  }) {
    if (!editingWork) return;
    const res = await fetch(`/api/works/${editingWork.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setEditingWork(null);
      fetchWorks();
    } else {
      const err = await res.json();
      showToast(err.error || "更新失败");
    }
  }

  async function handleDelete(id: number) {
    openConfirm("确认删除", "确定删除该工作项？", async () => {
      const res = await fetch(`/api/works/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchWorks();
      } else {
        const err = await res.json();
        showToast(err.error || "删除失败");
      }
      closeConfirm();
    });
  }

  async function handleArchive(id: number) {
    const res = await fetch(`/api/works/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isArchived: true }),
    });
    if (res.ok) {
      fetchWorks();
    } else {
      const err = await res.json();
      showToast(err.error || "归档失败");
    }
  }

  async function handleRestore(id: number) {
    const res = await fetch(`/api/works/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isArchived: false }),
    });
    if (res.ok) {
      fetchWorks();
    } else {
      const err = await res.json();
      showToast(err.error || "恢复失败");
    }
  }

  async function handleMove(id: number, direction: number) {
    const categoryWorks = works.filter(
      (w) => w.category === works.find((w) => w.id === id)?.category && !w.isArchived
    );
    const sorted = categoryWorks.sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((w) => w.id === id);
    const target = idx + direction;
    if (target < 0 || target >= sorted.length) return;

    const currentWork = sorted[idx];
    const targetWork = sorted[target];

    await Promise.all([
      fetch(`/api/works/${currentWork.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: targetWork.sortOrder }),
      }),
      fetch(`/api/works/${targetWork.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: currentWork.sortOrder }),
      }),
    ]);

    fetchWorks();
  }

  const isAdmin = user?.isWorkListAdmin ?? false;

  const routineWorks = works
    .filter((w) => w.category === "routine" && !w.isArchived)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const nonRoutineWorks = works
    .filter((w) => w.category === "non-routine" && !w.isArchived)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const archivedWorks = works
    .filter((w) => w.isArchived)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
          <div className="flex items-center gap-2">
            <Image src="/company/logo.png" alt={process.env.NEXT_PUBLIC_COMPANY_NAME || "公司"} width={100} height={30} className="h-auto w-auto max-w-[100px] object-contain" />
            <DepartmentSwitcher />
          </div>
          <div className="flex items-center gap-5">
            <button
              onClick={() => router.push("/portal")}
              className="text-sm text-gray-500 hover:text-emerald-600"
            >
              返回入口
            </button>
            <NavLink href="/dashboard">填写周报</NavLink>
            <NavLink href="/works">工作清单</NavLink>
            <NavLink href="/history">历史记录</NavLink>
            <UserMenu user={user} />
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-800">部门工作清单</h2>
          {isAdmin && !showForm && !editingWork && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700"
            >
              + 添加工作项
            </button>
          )}
        </div>

        {!isAdmin && (
          <div className="mb-4 rounded-md bg-gray-100 px-4 py-2 text-sm text-gray-500">
            仅部门管理员可编辑工作清单
          </div>
        )}

        {showForm && (
          <div className="mb-6">
            <WorkForm
              onSave={handleCreate}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        {/* 日常工作 */}
        <div className="mb-8">
          <SectionHeader
            title="日常工作"
            count={routineWorks.length}
            expanded={routineExpanded}
            onToggle={() => setRoutineExpanded(!routineExpanded)}
          />
          {routineExpanded && (
            <div className="space-y-3">
              {routineWorks.map((work, index) =>
                editingWork?.id === work.id ? (
                  <WorkForm
                    key={work.id}
                    initial={work}
                    onSave={handleUpdate}
                    onCancel={() => setEditingWork(null)}
                  />
                ) : (
                  <WorkCard
                    key={work.id}
                    work={work}
                    isAdmin={isAdmin}
                    onEdit={setEditingWork}
                    onDelete={handleDelete}
                    onMove={handleMove}
                    onArchive={handleArchive}
                    isFirst={index === 0}
                    isLast={index === routineWorks.length - 1}
                  />
                )
              )}
              {routineWorks.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
                  暂无日常工作项
                </div>
              )}
            </div>
          )}
        </div>

        {/* 其他工作 */}
        <div className="mb-8">
          <SectionHeader
            title="其他工作"
            count={nonRoutineWorks.length}
            expanded={nonRoutineExpanded}
            onToggle={() => setNonRoutineExpanded(!nonRoutineExpanded)}
          />
          {nonRoutineExpanded && (
            <div className="space-y-3">
              {nonRoutineWorks.map((work, index) =>
                editingWork?.id === work.id ? (
                  <WorkForm
                    key={work.id}
                    initial={work}
                    onSave={handleUpdate}
                    onCancel={() => setEditingWork(null)}
                  />
                ) : (
                  <WorkCard
                    key={work.id}
                    work={work}
                    isAdmin={isAdmin}
                    onEdit={setEditingWork}
                    onDelete={handleDelete}
                    onMove={handleMove}
                    onArchive={handleArchive}
                    isFirst={index === 0}
                    isLast={index === nonRoutineWorks.length - 1}
                  />
                )
              )}
              {nonRoutineWorks.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
                  暂无其他工作项
                </div>
              )}
            </div>
          )}
        </div>

        {/* 已归档 */}
        {archivedWorks.length > 0 && (
          <div>
            <SectionHeader
              title="已归档"
              count={archivedWorks.length}
              expanded={archivedExpanded}
              onToggle={() => setArchivedExpanded(!archivedExpanded)}
            />
            {archivedExpanded && (
              <div className="space-y-3">
                {archivedWorks.map((work) =>
                  editingWork?.id === work.id ? (
                    <WorkForm
                      key={work.id}
                      initial={work}
                      onSave={handleUpdate}
                      onCancel={() => setEditingWork(null)}
                    />
                  ) : (
                    <WorkCard
                      key={work.id}
                      work={work}
                      isAdmin={isAdmin}
                      onEdit={setEditingWork}
                      onDelete={handleDelete}
                      onMove={handleMove}
                      onRestore={handleRestore}
                      isFirst={false}
                      isLast={false}
                    />
                  )
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Toast */}
      {toast.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative z-10 rounded-lg bg-white px-6 py-3 text-sm font-medium text-gray-800 shadow-lg">
            {toast.message}
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {confirmModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeConfirm} />
          <div className="relative z-10 w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
            <h3 className="mb-2 text-lg font-semibold text-gray-800">{confirmModal.title}</h3>
            <p className="mb-4 text-sm text-gray-600">{confirmModal.message}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeConfirm}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => confirmModal.onConfirm?.()}
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
