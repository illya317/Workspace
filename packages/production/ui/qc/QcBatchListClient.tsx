"use client";

import { workspacePath } from "@workspace/core/routing";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageSurface, createPageBody, useFeedback } from "@workspace/core/ui";
import type { SurfaceToolbarItems } from "@workspace/core/ui";
import type { QcBatchSummary } from "@workspace/production/server/qc";
import { QC_BATCH_PAGE_SIZE_OPTIONS, QC_BATCH_STATUS_OPTIONS, createQcBatchCreateSection } from "./QcBatchListControls";
import { createQcBatchTableSection, formatQcBatchDate, qcBatchStatusText, type QcBatchTableRow } from "./QcBatchTable";
import { productionQcPageKind, type ProductionQcPageChromeSpec } from "./ProductionQcPageChrome";

interface Props {
  initialRows: QcBatchTableRow[];
  products: Array<{ id: string; productName: string }>;
  pageChrome?: ProductionQcPageChromeSpec;
}

function todayBatchNumber() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export default function QcBatchListClient({ initialRows, products, pageChrome }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [productKey, setProductKey] = useState(products[0]?.id ?? "");
  const [batchNumber, setBatchNumber] = useState(() => todayBatchNumber());
  const [statusFilter, setStatusFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [createOpen, setCreateOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const feedback = useFeedback();

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
      feedback.error("请选择产品并填写批号");
      return;
    }
    startTransition(async () => {
      const res = await fetch(workspacePath("/api/modules/production/qc-batches"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productKey, batchNumber }),
      });
      const body = await res.json();
      if (!res.ok) {
        feedback.error(body.error || "创建失败");
        return;
      }
      setCreateOpen(false);
      router.push(`/production/qc-batches/${body.data.id}`);
    });
  }

  async function deleteBatch(target: QcBatchSummary) {
    const ok = await feedback.confirmDelete({
      title: "删除批次",
      message: `确认删除批次 ${target.batchNumber}？`,
      confirmLabel: "删除批次",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await fetch(workspacePath(`/api/modules/production/qc-batches/${target.id}`), { method: "DELETE" });
      if (!res.ok) {
        feedback.error("删除失败");
        return;
      }
      setRows((items) => items.filter((batch) => batch.id !== target.id));
      feedback.success("已删除批次");
    });
  }

  const toolbarItems: SurfaceToolbarItems = [
    {
      kind: "select",
      key: "status",
      section: "filter",
      label: "状态",
      options: QC_BATCH_STATUS_OPTIONS,
      value: statusFilter,
      onChange: (value) => {
        setStatusFilter(String(value ?? "all"));
        setPage(1);
      },
    },
    {
      kind: "autocomplete",
      key: "product",
      section: "filter",
      value: productFilter,
      options: productFilterOptions,
      onChange: (value) => {
        setProductFilter(String(value ?? ""));
        setPage(1);
      },
      placeholder: "全部产品",
    },
    {
      kind: "select",
      key: "page-size",
      section: "meta",
      value: String(pageSize),
      options: QC_BATCH_PAGE_SIZE_OPTIONS,
      onChange: (value) => {
        setPageSize(Number(value));
        setPage(1);
      },
      label: "分页",
    },
    {
      kind: "create",
      key: "create",
      section: "action",
      label: createOpen ? "收起新建" : "新建批次",
      active: createOpen,
      onClick: () => setCreateOpen((open) => !open),
    },
    {
      kind: "action-group",
      key: "batch-actions",
      section: "action",
      actions: [
        { key: "refresh", label: "刷新", kind: "refresh", onClick: refreshBatches },
        { key: "export", label: "导出", kind: "download", onClick: exportBatches },
      ],
    },
  ];
  const createSection = createQcBatchCreateSection({
    open: createOpen,
    products,
    productKey,
    batchNumber,
    submitting: isPending,
    onProductKeyChange: setProductKey,
    onBatchNumberChange: setBatchNumber,
    onSubmit: () => void createBatch(),
    onCancel: () => {
      setCreateOpen(false);
      setBatchNumber(todayBatchNumber());
    },
  });

  return (
    <PageSurface kind={pageChrome ? productionQcPageKind(pageChrome) : "standard"}
      toolbar={{ items: toolbarItems }}
      body={createPageBody([
        ...(createSection ? [createSection] : []),
        createQcBatchTableSection({
          rows: visibleBatches,
          onView: (batch) => router.push(`/production/qc-batches/${batch.id}`),
          onDelete: (batch) => void deleteBatch(batch),
        }),
      ])}
      footer={{ pagination: { page, totalPages, total: filtered.length, onPageChange: setPage, compact: true } }}
    />
  );
}
