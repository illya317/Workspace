"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import UserMenu from "@/app/components/UserMenu";
import ConfirmModal from "@/app/components/ConfirmModal";
import { useToast } from "@/app/hooks/useToast";
import Toast from "@/app/components/Toast";
import { SessionUser } from "@/lib/types";

interface Contract {
  id: number;
  contractNo: string | null;
  name: string;
  partyA: string | null;
  partyB: string | null;
  shareholder: string | null;
  category: string | null;
  content: string | null;
  handler: string | null;
  signDate: string | null;
  endDate: string | null;
  status: string | null;
  amount: number | null;
  executedAmount: number | null;
  location: string | null;
  remark: string | null;
}

type ModalMode = "create" | "edit" | null;

const pageSize = 50;

export default function ContractsClient({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [loading] = useState(false);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editing, setEditing] = useState<Partial<Contract>>({});
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [allLocations, setAllLocations] = useState<string[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [allStatuses, setAllStatuses] = useState<string[]>([]);
  const { toast, showToast, closeToast } = useToast();

  const fetchContracts = async (p = page) => {
    const params = new URLSearchParams();
    params.set("page", String(p));
    params.set("pageSize", String(pageSize));
    if (q) params.set("q", q);
    if (locationFilter) params.set("location", locationFilter);
    if (categoryFilter) params.set("category", categoryFilter);
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/contracts?${params.toString()}`);
    const data = await res.json();
    setContracts(data.contracts || []);
    setTotal(data.total || 0);
    setAllLocations(data.locations || []);
    setAllCategories(data.categories || []);
    setAllStatuses(data.statuses || []);
  };

  useEffect(() => {
    if (!loading) {
      setPage(1);
      fetchContracts(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, locationFilter, categoryFilter, statusFilter, loading]);

  useEffect(() => {
    if (!loading) fetchContracts(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const totalPages = useMemo(() => Math.ceil(total / pageSize), [total]);

  const openCreate = () => {
    setEditing({ location: "北京办公区", status: "执行中" });
    setModalMode("create");
  };

  const openEdit = (c: Contract) => {
    setEditing({ ...c });
    setModalMode("edit");
  };

  const closeModal = () => {
    setModalMode(null);
    setEditing({});
  };

  const saveContract = async () => {
    if (!editing.name) {
      showToast("合同名称为必填", "error");
      return;
    }
    setSaving(true);
    try {
      if (modalMode === "create") {
        const res = await fetch("/api/contracts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editing),
        });
        if (!res.ok) throw new Error("创建失败");
        showToast("创建成功", "success");
      } else if (editing.id) {
        const res = await fetch(`/api/contracts/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editing),
        });
        if (!res.ok) throw new Error("保存失败");
        showToast("保存成功", "success");
      }
      closeModal();
      fetchContracts(page);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "操作失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/contracts/${deleteId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("删除失败");
      showToast("删除成功", "success");
      fetchContracts(page);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "删除失败", "error");
    } finally {
      setDeleteId(null);
    }
  };

  const updateField = (
    field: keyof Contract,
    value: string | number | null,
  ) => {
    setEditing((prev) => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">加载中...</p>
      </div>
    );
  }

  const locations = allLocations;
  const categories = allCategories;
  const statuses = allStatuses;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Image
              src="/company/logo.png"
              alt="公司"
              width={100}
              height={30}
              className="h-auto w-auto max-w-[100px] object-contain"
            />
            <span className="text-sm text-gray-400">|</span>
            <span className="text-sm font-medium text-gray-700">合同台账</span>
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

      <main className="mx-auto max-w-7xl px-4 py-6">
        {/* 筛选栏 */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="搜索合同名称、签署方、内容..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-64 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
          <div className="relative">
            <input
              list="location-list"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              placeholder="全部位置"
              className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <datalist id="location-list">
              {locations.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </div>
          <div className="relative">
            <input
              list="category-list"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              placeholder="全部类型"
              className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <datalist id="category-list">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="relative">
            <input
              list="status-list"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              placeholder="全部状态"
              className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <datalist id="status-list">
              {statuses.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div className="flex-1" />
          <button
            onClick={openCreate}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            + 新增合同
          </button>
        </div>

        <p className="mb-2 text-xs text-gray-500">共 {total} 条记录</p>

        {/* 表格 */}
        <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3">编号</th>
                <th className="px-4 py-3">名称</th>
                <th className="px-4 py-3">签署方</th>
                <th className="px-4 py-3">签署对方</th>
                <th className="px-4 py-3">类型</th>
                <th className="px-4 py-3">签订日期</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3 text-right">金额</th>
                <th className="px-4 py-3">位置</th>
                <th className="px-4 py-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contracts.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">
                    {c.contractNo || "-"}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {c.name}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.partyA || "-"}</td>
                  <td className="px-4 py-3 text-gray-600">{c.partyB || "-"}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.category || "-"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.signDate || "-"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${c.status === "执行中" ? "bg-green-100 text-green-700" : c.status === "已结束" ? "bg-gray-100 text-gray-600" : "bg-blue-100 text-blue-700"}`}
                    >
                      {c.status || "-"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {c.amount != null ? c.amount.toLocaleString() : "-"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.location || "-"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => openEdit(c)}
                      className="mr-2 text-xs text-emerald-600 hover:underline"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => setDeleteId(c.id)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
              {contracts.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="px-4 py-8 text-center text-gray-400"
                  >
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-md border px-3 py-1 text-sm disabled:opacity-40"
            >
              上一页
            </button>
            <span className="text-sm text-gray-600">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-md border px-3 py-1 text-sm disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        )}
      </main>

      {/* 新建/编辑弹窗 */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-800">
              {modalMode === "create" ? "新增合同" : "编辑合同"}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "合同编号", key: "contractNo" },
                { label: "合同名称 *", key: "name", required: true },
                { label: "签署方", key: "partyA" },
                { label: "签署对方", key: "partyB" },
                { label: "股东方", key: "shareholder" },
                { label: "合同类型", key: "category" },
                { label: "经办人", key: "handler" },
                { label: "签订日期", key: "signDate" },
                { label: "结束日期", key: "endDate" },
                { label: "状态", key: "status" },
                { label: "合同金额", key: "amount", type: "number" },
                { label: "已执行金额", key: "executedAmount", type: "number" },
                { label: "文件位置", key: "location" },
              ].map((f) => (
                <div key={f.key}>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    {f.label}
                  </label>
                  <input
                    type={f.type || "text"}
                    value={editing[f.key as keyof Contract] ?? ""}
                    onChange={(e) =>
                      updateField(
                        f.key as keyof Contract,
                        f.type === "number"
                          ? e.target.value
                            ? parseFloat(e.target.value)
                            : null
                          : e.target.value,
                      )
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              ))}
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  合同内容
                </label>
                <textarea
                  value={editing.content ?? ""}
                  onChange={(e) => updateField("content", e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  备注
                </label>
                <textarea
                  value={editing.remark ?? ""}
                  onChange={(e) => updateField("remark", e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={closeModal}
                className="rounded-md border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={saveContract}
                disabled={saving}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={deleteId !== null}
        title="确认删除"
        message="确定要删除这条合同记录吗？此操作不可撤销。"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />

      <Toast
        message={toast?.message || ""}
        type={toast?.type}
        show={!!toast}
        onClose={closeToast}
      />
    </div>
  );
}
