"use client";

import { workspacePath } from "@workspace/core/routing";
import { CheckCircle2, ClipboardList, Eye, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageSurface, createEmptySection, createPageBody, useFeedback } from "@workspace/core/ui";
import type { SurfaceToolbarItems } from "@workspace/core/ui";
import type { QcBatchSummary, QcEditorRuntimeTemplate } from "@workspace/production/server/qc";
import { buildQcBatchWorkflow } from "@workspace/production/qc/workflow";
import { QC_BATCH_PAGE_SIZE_OPTIONS, QC_BATCH_STATUS_OPTIONS, createQcBatchCreateSection } from "./QcBatchListControls";
import QcBatchRecordStageList from "./QcBatchRecordStageList";

export interface QcBatchTableRow extends QcBatchSummary {
  inspectorNames: string[];
  reviewerNames: string[];
  statusLabels: string[];
  runtimeTemplate?: QcEditorRuntimeTemplate | null;
}

interface Props {
  initialRows: QcBatchTableRow[];
  products: Array<{ id: string; productName: string }>;
}

function qcBatchStatusText(batch: Pick<QcBatchTableRow, "statusLabels">) {
  return batch.statusLabels.join("、") || "检验中";
}

function formatQcBatchDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(value));
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
  const [selectedId, setSelectedId] = useState<number | null>(initialRows[0]?.id ?? null);
  const [productKey, setProductKey] = useState(products[0]?.id ?? "");
  const [batchNumber, setBatchNumber] = useState(() => todayBatchNumber());
  const [statusFilter, setStatusFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [createOpen, setCreateOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const feedback = useFeedback();

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

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
  const selectedBatch = useMemo(
    () => visibleBatches.find((batch) => batch.id === selectedId) ?? visibleBatches[0] ?? null,
    [selectedId, visibleBatches],
  );

  useEffect(() => {
    if (!visibleBatches.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !visibleBatches.some((batch) => batch.id === selectedId)) setSelectedId(visibleBatches[0].id);
  }, [selectedId, visibleBatches]);

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
    link.download = "qc.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function createBatch() {
    if (!productKey || !batchNumber.trim()) {
      feedback.error("请选择产品并填写批号");
      return;
    }
    startTransition(async () => {
      const res = await fetch(workspacePath("/api/modules/production/qc"), {
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
      setSelectedId(Number(body.data.id));
      feedback.success("已创建批次");
      router.refresh();
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
      const res = await fetch(workspacePath(`/api/modules/production/qc/${target.id}`), { method: "DELETE" });
      if (!res.ok) {
        feedback.error("删除失败");
        return;
      }
      setRows((items) => {
        const next = items.filter((batch) => batch.id !== target.id);
        if (selectedId === target.id) setSelectedId(next[0]?.id ?? null);
        return next;
      });
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
    <PageSurface kind="standard"
      toolbar={{ items: toolbarItems }}
      body={createPageBody([
        ...(createSection ? [createSection] : []),
        createEmptySection("qc-workbench", {
          presentation: "plain",
          content: (
            <BatchWorkbench
              rows={visibleBatches}
              selectedBatch={selectedBatch}
              onSelect={(batch) => setSelectedId(batch.id)}
              onDelete={(batch) => void deleteBatch(batch)}
            />
          ),
        }),
      ])}
      footer={{ pagination: { page, totalPages, total: filtered.length, onPageChange: setPage, compact: true } }}
    />
  );
}

function BatchWorkbench({
  rows,
  selectedBatch,
  onSelect,
  onDelete,
}: {
  rows: QcBatchTableRow[];
  selectedBatch: QcBatchTableRow | null;
  onSelect: (batch: QcBatchTableRow) => void;
  onDelete: (batch: QcBatchTableRow) => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[25rem_minmax(0,1fr)]">
      <div className="max-lg:order-last overflow-hidden rounded-xl border border-emerald-100 bg-white shadow-sm">
        <div className="border-b border-emerald-100 bg-emerald-50/50 px-4 py-3">
          <div className="text-sm font-semibold text-slate-950">批次队列</div>
          <div className="mt-1 text-xs text-slate-500">{rows.length} 个批次，点击查看阶段详情</div>
        </div>
        <div className="divide-y divide-emerald-50 p-2">
          {rows.length ? rows.map((batch) => (
            <BatchQueueItem
              key={batch.id}
              batch={batch}
              selected={selectedBatch?.id === batch.id}
              onSelect={() => onSelect(batch)}
              onDelete={() => onDelete(batch)}
            />
          )) : (
            <div className="rounded-lg px-4 py-10 text-center text-sm text-slate-500">暂无批次记录。</div>
          )}
        </div>
      </div>

      <div className="min-w-0">
        {selectedBatch?.runtimeTemplate ? (
          <QcBatchRecordStageList batch={selectedBatch} runtimeTemplate={selectedBatch.runtimeTemplate} embedded />
        ) : selectedBatch ? (
          <div className="rounded-xl border border-emerald-100 bg-white p-6 text-sm text-slate-500 shadow-sm">
            当前批次的模板详情尚未加载，刷新后可查看阶段工作台。
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-100 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
            选择左侧批次查看阶段详情。
          </div>
        )}
      </div>
    </div>
  );
}

function BatchQueueItem({
  batch,
  selected,
  onSelect,
  onDelete,
}: {
  batch: QcBatchTableRow;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const metrics = batchMetrics(batch);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`group my-1 grid w-full gap-3 rounded-lg border px-4 py-4 text-left transition ${selected ? "border-emerald-300 bg-emerald-50 text-slate-950 shadow-sm ring-1 ring-emerald-100" : "border-transparent bg-white text-slate-950 hover:border-emerald-100 hover:bg-emerald-50/40"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md border text-xs font-semibold ${selected ? "border-emerald-200 bg-white text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>{batch.id}</span>
            <span className="truncate text-base font-semibold">{batch.batchNumber}</span>
          </div>
          <div className={`mt-1 truncate text-sm ${selected ? "text-emerald-800" : "text-slate-500"}`}>{batch.productName}</div>
        </div>
        <button
          type="button"
          aria-label={`删除批次 ${batch.batchNumber}`}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition ${selected ? "border-emerald-200 bg-white text-red-600 hover:bg-red-50" : "border-red-100 text-red-600 hover:bg-red-50"}`}
        >
          <Trash2 size={16} strokeWidth={1.9} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Metric label="进度" value={`${metrics.completedTests}/${metrics.totalTests}`} selected={selected} />
        <Metric label="待复核" value={String(metrics.pendingReview)} selected={selected} tone={metrics.pendingReview ? "amber" : "neutral"} />
        <Metric label="阶段" value={`${metrics.completedStages}/${metrics.totalStages}`} selected={selected} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${selected ? "border-emerald-200 bg-white text-emerald-700" : statusClass(batch)}`}>
          {statusIcon(batch)}
          {qcBatchStatusText(batch)}
        </span>
        <span className={`text-xs ${selected ? "text-emerald-700" : "text-slate-500"}`}>{formatQcBatchDate(batch.createdAt)}</span>
      </div>

      <div className={`inline-flex items-center gap-1 text-xs font-medium ${selected ? "text-emerald-700" : "text-emerald-700"}`}>
        <Eye size={14} strokeWidth={1.9} />
        {selected ? "正在查看" : "打开详情"}
      </div>
    </div>
  );
}

function Metric({ label, value, selected, tone = "neutral" }: { label: string; value: string; selected: boolean; tone?: "neutral" | "amber" }) {
  const valueClass = tone === "amber" ? "text-amber-700" : selected ? "text-emerald-900" : "text-slate-950";
  return (
    <div className={`rounded-lg border px-2 py-2 ${selected ? "border-emerald-200 bg-white" : "border-slate-200 bg-slate-50"}`}>
      <div className={`text-[11px] ${selected ? "text-emerald-700" : "text-slate-500"}`}>{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${valueClass}`}>{value}</div>
    </div>
  );
}

function batchMetrics(batch: QcBatchTableRow) {
  const workflow = batch.runtimeTemplate ? buildQcBatchWorkflow(batch.runtimeTemplate, batch) : null;
  const tests = workflow?.tests ?? [];
  const stages = workflow?.stages ?? [];
  return {
    totalTests: tests.length,
    completedTests: tests.filter((test) => test.complete).length,
    pendingReview: tests.filter((test) => test.inspected && !test.reviewed).length,
    totalStages: stages.length,
    completedStages: stages.filter((stage) => stage.complete).length,
  };
}

function statusClass(batch: QcBatchTableRow) {
  if (batch.statusLabels.includes("已验收")) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (batch.statusLabels.includes("待复核")) return "border-amber-200 bg-amber-50 text-amber-700";
  if (batch.statusLabels.includes("异常")) return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function statusIcon(batch: QcBatchTableRow) {
  if (batch.statusLabels.includes("已验收")) return <CheckCircle2 size={13} strokeWidth={1.9} />;
  if (batch.statusLabels.includes("待复核")) return <RotateCcw size={13} strokeWidth={1.9} />;
  return <ClipboardList size={13} strokeWidth={1.9} />;
}
