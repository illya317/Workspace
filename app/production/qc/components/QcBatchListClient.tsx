"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SelectField } from "@workspace/core/ui";
import ConfirmModal from "@/app/components/ConfirmModal";
import Toast from "@/app/components/Toast";
import type { QcBatchList, QcBatchSummary, QcRecordTemplateSummary } from "@/server/services/production/qc";

interface Props {
  initialData: QcBatchList;
  products: QcRecordTemplateSummary[];
}

function statusLabel(status: QcBatchSummary["status"]) {
  return status === "submitted" ? "已提交" : "草稿";
}

function formatDate(value: string) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-") : "-";
}

export default function QcBatchListClient({ initialData, products }: Props) {
  const router = useRouter();
  const [batches, setBatches] = useState(initialData.batches);
  const [productKey, setProductKey] = useState(products[0]?.id ?? "");
  const [batchNumber, setBatchNumber] = useState("");
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<QcBatchSummary | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [isPending, startTransition] = useTransition();

  const counts = useMemo(() => ({
    total: batches.length,
    draft: batches.filter((batch) => batch.status === "draft").length,
    submitted: batches.filter((batch) => batch.status === "submitted").length,
  }), [batches]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return batches;
    return batches.filter((batch) => [
      batch.batchNumber,
      batch.productName,
      batch.inspector,
    ].some((value) => value.toLowerCase().includes(keyword)));
  }, [batches, query]);

  async function createBatch() {
    if (!productKey || !batchNumber.trim()) {
      setToast({ message: "请选择产品并填写批号", type: "error" });
      return;
    }
    startTransition(async () => {
      const res = await fetch("/workspace/api/production/qc/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productKey, batchNumber }),
      });
      const body = await res.json();
      if (!res.ok) {
        setToast({ message: body.error || "创建失败", type: "error" });
        return;
      }
      router.push(`/production/qc/batches/${body.data.id}`);
    });
  }

  async function deleteBatch() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    startTransition(async () => {
      const res = await fetch(`/workspace/api/production/qc/batches/${target.id}`, { method: "DELETE" });
      if (!res.ok) {
        setToast({ message: "删除失败", type: "error" });
        return;
      }
      setBatches((items) => items.filter((batch) => batch.id !== target.id));
      setToast({ message: "已删除批次", type: "success" });
    });
  }

  return (
    <section className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">新建批次</h2>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-[minmax(220px,1.1fr)_minmax(220px,1fr)_auto] md:items-end">
          <SelectField
            label="产品"
            value={productKey}
            onChange={setProductKey}
            options={products.map((product) => ({ value: product.id, label: product.productName }))}
            className="block font-semibold text-slate-600"
            selectClassName="mt-2 h-11 px-3 text-sm"
          />
          <label className="block text-xs font-semibold text-slate-600">
            批号
            <input
              value={batchNumber}
              onChange={(event) => setBatchNumber(event.target.value)}
              placeholder="请输入批号"
              className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-emerald-600"
            />
          </label>
          <button
            type="button"
            disabled={isPending}
            onClick={createBatch}
            className="h-11 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:bg-slate-300"
          >
            创建并进入检验记录
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">批次记录</h2>
        </div>
        <div className="grid gap-3 border-b border-slate-100 px-4 py-3 md:grid-cols-[1fr_300px] md:items-center">
          <div className="text-xs font-semibold text-slate-500">
            全部 {counts.total} · 草稿 {counts.draft} · 已提交 {counts.submitted}
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="筛选批号、产品、检验者"
            className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-600"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-3">ID</th>
                <th className="px-3 py-3">批号</th>
                <th className="px-3 py-3">产品</th>
                <th className="px-3 py-3">检验者</th>
                <th className="px-3 py-3">状态</th>
                <th className="px-3 py-3">创建时间</th>
                <th className="px-3 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((batch) => (
                <tr key={batch.id} className="hover:bg-slate-50">
                  <td className="px-3 py-3 text-slate-700">{batch.id}</td>
                  <td className="px-3 py-3 font-semibold text-slate-900">{batch.batchNumber}</td>
                  <td className="px-3 py-3 text-slate-700">{batch.productName}</td>
                  <td className="px-3 py-3 text-slate-700">{batch.inspector || "-"}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${batch.status === "draft" ? "bg-orange-50 text-orange-700 ring-1 ring-orange-200" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"}`}>
                      {statusLabel(batch.status)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-500">{formatDate(batch.createdAt)}</td>
                  <td className="px-3 py-3">
                    <div className="flex gap-3">
                      <Link href={`/production/qc/batches/${batch.id}`} className="font-semibold text-emerald-700 hover:underline">检验记录</Link>
                      <button type="button" onClick={() => setPendingDelete(batch)} className="font-semibold text-red-600 hover:underline">删除</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">暂无批次记录。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal
        open={!!pendingDelete}
        title="删除批次"
        message={`确认删除批次 ${pendingDelete?.batchNumber ?? ""}？`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={deleteBatch}
      />
      <Toast show={!!toast} message={toast?.message ?? ""} type={toast?.type} onClose={() => setToast(null)} />
    </section>
  );
}
