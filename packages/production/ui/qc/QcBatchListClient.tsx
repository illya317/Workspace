"use client";

import { workspacePath } from "@workspace/core/routing";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ConfirmModal from "@workspace/core/ui/ConfirmModal";
import Toast from "@workspace/core/ui/Toast";
import type { QcBatchSummary } from "@workspace/production/server/qc";
import { QcBatchCreatePanel, QcBatchToolbar } from "./QcBatchListControls";
import { QcBatchTable, formatQcBatchDate, qcBatchStatusText, type QcBatchTableRow } from "./QcBatchTable";

interface Props {
  initialRows: QcBatchTableRow[];
  products: Array<{ id: string; productName: string }>;
}

function todayBatchNumber() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export default function QcBatchListClient({ initialRows, products }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [productKey, setProductKey] = useState(products[0]?.id ?? "");
  const [batchNumber, setBatchNumber] = useState(() => todayBatchNumber());
  const [statusFilter, setStatusFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<QcBatchSummary | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [isPending, startTransition] = useTransition();

  const productFilterOptions = useMemo(
    () => products.map((product) => ({ value: product.id, label: product.productName })),
    [products],
  );

  const filtered = useMemo(() => {
    let next = rows;
    if (statusFilter === "inspecting") next = next.filter((batch) => batch.statusLabels.includes("检验中"));
    if (statusFilter === "reviewing") next = next.filter((batch) => batch.statusLabels.includes("待复核"));
    if (statusFilter === "accepted") next = next.filter((batch) => batch.statusLabels.includes("已验收"));
    if (statusFilter === "exception") next = next.filter((batch) => batch.statusLabels.includes("异常"));
    if (productFilter) next = next.filter((batch) => batch.productKey === productFilter);
    return next;
  }, [productFilter, rows, statusFilter]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filtered.length / pageSize)), [filtered.length, pageSize]);
  const visibleBatches = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  function refreshBatches() {
    router.refresh();
  }

  function exportBatches() {
    const header = ["ID", "批号", "产品", "检验者", "复核者", "状态", "创建时间"];
    const rows = filtered.map((batch) => [
      String(batch.id),
      batch.batchNumber,
      batch.productName,
      batch.inspectorNames.join("、") || "-",
      batch.reviewerNames.join("、") || "-",
      qcBatchStatusText(batch),
      formatQcBatchDate(batch.createdAt),
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "qc-batches.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function createBatch() {
    if (!productKey || !batchNumber.trim()) {
      setToast({ message: "请选择产品并填写批号", type: "error" });
      return;
    }
    startTransition(async () => {
      const res = await fetch(workspacePath("/api/modules/production/qc/batches"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productKey, batchNumber }),
      });
      const body = await res.json();
      if (!res.ok) {
        setToast({ message: body.error || "创建失败", type: "error" });
        return;
      }
      setCreateOpen(false);
      router.push(`/production/qc/batches/${body.data.id}`);
    });
  }

  async function deleteBatch() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    startTransition(async () => {
      const res = await fetch(workspacePath(`/api/modules/production/qc/batches/${target.id}`), { method: "DELETE" });
      if (!res.ok) {
        setToast({ message: "删除失败", type: "error" });
        return;
      }
      setRows((items) => items.filter((batch) => batch.id !== target.id));
      setToast({ message: "已删除批次", type: "success" });
    });
  }

  return (
    <section className="space-y-4">
      <QcBatchToolbar
        statusFilter={statusFilter}
        productFilter={productFilter}
        productOptions={productFilterOptions}
        pageSize={pageSize}
        onToggleCreate={() => setCreateOpen((open) => !open)}
        onStatusFilterChange={(value) => {
          setStatusFilter(value);
          setPage(1);
        }}
        onProductFilterChange={(value) => {
          setProductFilter(value);
          setPage(1);
        }}
        onPageSizeChange={(value) => {
          setPageSize(value);
          setPage(1);
        }}
        onRefresh={refreshBatches}
        onExport={exportBatches}
      />

      <QcBatchCreatePanel
        open={createOpen}
        products={products}
        productKey={productKey}
        batchNumber={batchNumber}
        submitting={isPending}
        onProductKeyChange={setProductKey}
        onBatchNumberChange={setBatchNumber}
        onSubmit={() => void createBatch()}
        onCancel={() => {
          setCreateOpen(false);
          setBatchNumber(todayBatchNumber());
        }}
      />

      <QcBatchTable
        rows={visibleBatches}
        page={page}
        totalPages={totalPages}
        total={filtered.length}
        onPageChange={setPage}
        onView={(batch) => router.push(`/production/qc/batches/${batch.id}`)}
        onDelete={setPendingDelete}
      />

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
