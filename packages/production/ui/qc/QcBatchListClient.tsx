"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageSurface, createMasterDetailBody, createPageBody, createStatusSection, useFeedback } from "@workspace/core/ui";
import type { BodySurfaceSelectorProps, BodySurfaceToolbarCreateProps, FormSurfaceItemSpec, SelectorSurfaceStatusSpec, SurfaceToolbarItems } from "@workspace/core/ui";
import type { QcBatchSummary, QcEditorRuntimeTemplate } from "@workspace/production/types";
import { isProductionBatchNumber, normalizeProductionBatchNumberInput } from "@workspace/platform/production-batch-number";
import { buildQcBatchWorkflow } from "@workspace/production/qc/workflow";
import { QC_BATCH_PAGE_SIZE_OPTIONS, QC_BATCH_STATUS_OPTIONS } from "./qc-options";
import { createQcBatchRecordStageBody } from "./QcBatchRecordStageList";

export interface QcBatchTableRow extends QcBatchSummary {
  inspectorNames: string[];
  reviewerNames: string[];
  statusLabels: string[];
  runtimeTemplate?: QcEditorRuntimeTemplate | null;
}

interface Props {
  initialRows: QcBatchTableRow[];
  products: Array<{ id: string; productId: number | null; productName: string }>;
  canCreate: boolean;
  canDelete: boolean;
  canExport: boolean;
}

function qcBatchStatusText(batch: Pick<QcBatchTableRow, "statusLabels">) {
  return batch.statusLabels.join("、") || "检验中";
}

function formatQcBatchDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(value));
}

function qcBatchMonthValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function todayBatchNumber() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export default function QcBatchListClient({ initialRows, products, canCreate, canDelete, canExport }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [selectedId, setSelectedId] = useState<number | null>(initialRows[0]?.id ?? null);
  const [productKey, setProductKey] = useState(products[0]?.id ?? "");
  const [batchNumber, setBatchNumber] = useState(() => todayBatchNumber());
  const [statusFilter, setStatusFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [createOpen, setCreateOpen] = useState(false);
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [, startTransition] = useTransition();
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
    if (monthFilter) next = next.filter((batch) => qcBatchMonthValue(batch.createdAt) === monthFilter);
    if (productFilter) next = next.filter((batch) => batch.productKey === productFilter);
    return next;
  }, [monthFilter, productFilter, rows, statusFilter]);

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
    const product = products.find((item) => item.id === productKey);
    if (!productKey || !product?.productId || !isProductionBatchNumber(batchNumber)) {
      feedback.error(product && !product.productId ? "该 QC 模板尚未关联产品主数据" : "请选择产品并填写202xMMDD格式的有效批号");
      throw new Error(product && !product.productId ? "该 QC 模板尚未关联产品主数据" : "请选择产品并填写202xMMDD格式的有效批号");
    }
    setCreatingBatch(true);
    try {
      const res = await fetch(workspacePath("/api/modules/production/qc"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.productId, productKey, batchNumber }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || "创建失败");
      }
      setSelectedId(Number(body.data.id));
      router.refresh();
      return { outcome: "saved" as const, message: "已创建批次" };
    } finally {
      setCreatingBatch(false);
    }
  }

  async function deleteBatch(target: QcBatchSummary) {
    const ok = await feedback.confirmDelete({
      title: "删除批次",
      message: `确认删除批次 ${target.batchNumber}？`,
      confirmLabel: "删除批次",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await fetch(workspacePath(`/api/modules/production/qc/${target.id}`), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: target.version }),
      });
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
      label: "状态",
      options: QC_BATCH_STATUS_OPTIONS,
      value: statusFilter,
      onChange: (value) => {
        setStatusFilter(String(value ?? "all"));
        setPage(1);
      },
    },
    {
      kind: "period",
      key: "month",
      mode: "month",
      value: monthFilter,
      onChange: (value) => {
        setMonthFilter(value);
        setPage(1);
      },
      placeholder: "全部月份",
    },
    {
      kind: "select",
      key: "product",
      value: productFilter,
      options: productFilterOptions,
      onChange: (value) => {
        setProductFilter(String(value ?? ""));
        setPage(1);
      },
      placeholder: "全部产品",
    },
    {
      kind: "page-size",
      key: "page-size",
      value: String(pageSize),
      options: QC_BATCH_PAGE_SIZE_OPTIONS,
      onChange: (value) => {
        setPageSize(Number(value));
        setPage(1);
      },
      label: "分页",
    },
    {
      kind: "action-group",
      key: "batch-actions",
      actions: [
        { key: "refresh", label: "刷新", kind: "refresh", onClick: refreshBatches },
        ...(canExport ? [{ key: "export", label: "导出", kind: "download" as const, onClick: exportBatches }] : []),
      ],
    },
  ];
  const createItems: FormSurfaceItemSpec[] = [
    {
      key: "product",
      label: "产品",
      required: true,
      spec: { valueType: "string", control: "choice", options: { source: "static", visibleCount: 5, items: products.map((product) => ({ value: product.id, label: product.productId ? product.productName : `${product.productName}（未关联产品主数据）` })) } },
      value: productKey,
      onChange: (value) => setProductKey(String(value ?? "")),
      placeholder: "搜索产品",
    },
    {
      key: "batchNumber",
      label: "批号",
      required: true,
      spec: { valueType: "string", control: "text" },
      value: batchNumber,
      onChange: (value) => setBatchNumber(normalizeProductionBatchNumberInput(value)),
      placeholder: "例如 20260724",
      inputMode: "numeric",
      maxLength: 8,
    },
  ];
  const createBody: BodySurfaceToolbarCreateProps = {
    kind: "create",
    create: {
      id: "qc-batch-create",
      trigger: "toolbar",
      presentation: "inline",
      title: "新建批次",
      open: createOpen,
      canCreate,
      disabled: creatingBatch,
      content: { kind: "form", form: { items: createItems, layout: { columns: 3 } } },
      submission: { action: "save", disabled: creatingBatch || !productKey || !isProductionBatchNumber(batchNumber), execute: createBatch },
      onOpenChange: setCreateOpen,
      onCancel: () => setBatchNumber(todayBatchNumber()),
    },
  };
  const queueBody: BodySurfaceSelectorProps = {
    kind: "selector",
    selector: {
      kind: "list",
      title: `批次队列 · ${visibleBatches.length}`,
      items: visibleBatches.map((batch) => ({
        key: batch.id,
        value: batch,
        card: renderBatchQueueCard(batch, selectedBatch?.id === batch.id, canDelete ? (item) => void deleteBatch(item) : undefined),
      })),
      selectedId: selectedBatch?.id ?? null,
      onSelect: (batch) => setSelectedId(batch.id),
      emptyText: "暂无批次记录。",
    },
  };
  const detailBody = selectedBatch?.runtimeTemplate
    ? createQcBatchRecordStageBody(selectedBatch, selectedBatch.runtimeTemplate)
    : createPageBody([createStatusSection("qc-batch-selection", {
      kind: "empty",
      content: selectedBatch ? "当前批次的模板详情尚未加载，刷新后可查看阶段工作台。" : "选择左侧批次查看阶段详情。",
    })]);

  return (
    <PageSurface kind="standard"
      toolbar={{ items: toolbarItems }}
      body={createPageBody([
        { key: "qc-batch-create", body: createBody },
        { key: "qc-workbench", body: createMasterDetailBody({ master: { label: "质检批次", presentation: "compact", body: queueBody }, detail: detailBody }) },
      ])}
      footer={{ pagination: { page, totalPages, total: filtered.length, onPageChange: setPage, compact: true } }}
    />
  );
}

function renderBatchQueueCard(batch: QcBatchTableRow, active: boolean, onDelete?: (batch: QcBatchTableRow) => void) {
  const metrics = batchMetrics(batch);
  return {
    title: batch.batchNumber,
    subtitle: batch.productName,
    code: qcBatchStatusText(batch),
    codeTone: batchStatusTone(batch),
    leading: batch.id,
    meta: [
      `进度 ${metrics.completedTests}/${metrics.totalTests}`,
      `待复核 ${metrics.pendingReview}`,
      `阶段 ${metrics.completedStages}/${metrics.totalStages}`,
    ],
    metaLine: formatQcBatchDate(batch.createdAt),
    actions: onDelete ? [{
      key: "delete",
      label: `删除批次 ${batch.batchNumber}`,
      icon: "delete-bin" as const,
      onClick: () => onDelete(batch),
      size: "sm" as const,
      variant: "danger" as const,
    }] : undefined,
    active,
  };
}

function batchMetrics(batch: QcBatchTableRow) {
  const workflow = batch.runtimeTemplate ? buildQcBatchWorkflow(batch.runtimeTemplate, batch) : null;
  const tests = workflow?.tests ?? [];
  const stages = workflow?.stages ?? [];
  return {
    totalTests: tests.length,
    completedTests: tests.filter((test) => test.complete).length,
    pendingReview: tests.filter((test) => test.inspected && !test.reviewed).length
      + stages.filter((stage) => stage.precheckInspected && !stage.precheckReviewed).length,
    totalStages: stages.length,
    completedStages: stages.filter((stage) => stage.complete).length,
  };
}

function batchStatusTone(batch: QcBatchTableRow): SelectorSurfaceStatusSpec["tone"] {
  if (batch.statusLabels.includes("已验收")) return "success";
  if (batch.statusLabels.includes("待复核") || batch.statusLabels.includes("异常")) return "warning";
  return "default";
}
