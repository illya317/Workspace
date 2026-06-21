"use client";

import { workspacePath } from "@workspace/core/routing";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ActionButton,
  DataTable,
  DataTableActionsCell,
  FormField,
  IconActionButton,
  InlineCreatePanel,
  PanelCard,
  Pagination,
  RefreshActionButton,
  SelectField,
  TableScrollFrame,
  TextField,
  Toolbar,
  ToolbarOptionGroup,
  type DataTableColumn,
} from "@workspace/core/ui";
import ConfirmModal from "@workspace/core/ui/ConfirmModal";
import Toast from "@workspace/core/ui/Toast";
import type { QcBatchList, QcBatchSummary, QcRecordTemplateSummary } from "@workspace/production/server/qc";

interface Props {
  initialData: QcBatchList;
  products: QcRecordTemplateSummary[];
}

function statusLabel(status: QcBatchSummary["status"]) {
  return status === "submitted" ? "已提交" : "待检";
}

function formatDate(value: string) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-") : "-";
}

const batchColumns: DataTableColumn<QcBatchSummary>[] = [
  {
    key: "id",
    label: "ID",
    required: true,
    render: (batch) => <span className="text-slate-700">{batch.id}</span>,
  },
  {
    key: "batchNumber",
    label: "批号",
    required: true,
    render: (batch) => <span className="text-slate-700">{batch.batchNumber}</span>,
  },
  {
    key: "productName",
    label: "产品",
    required: true,
    render: (batch) => <span className="text-slate-700">{batch.productName}</span>,
  },
  {
    key: "inspector",
    label: "检验者",
    required: true,
    render: (batch) => <span className="text-slate-700">{batch.inspector || "-"}</span>,
  },
  {
    key: "status",
    label: "状态",
    required: true,
    render: (batch) => <span className="text-slate-700">{statusLabel(batch.status)}</span>,
  },
  {
    key: "createdAt",
    label: "创建时间",
    required: true,
    render: (batch) => <span className="text-slate-500">{formatDate(batch.createdAt)}</span>,
  },
];

const statusOptions = [
  { value: "all", label: "全部" },
  { value: "pending", label: "待检" },
  { value: "submitted", label: "已提交" },
  { value: "exception", label: "异常" },
];

const pageSizeOptions = [20, 50, 100, 200].map((size) => ({
  value: String(size),
  label: `${size}条/页`,
}));

export default function QcBatchListClient({ initialData, products }: Props) {
  const router = useRouter();
  const [batches, setBatches] = useState(initialData.batches);
  const [productKey, setProductKey] = useState(products[0]?.id ?? "");
  const [batchNumber, setBatchNumber] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<QcBatchSummary | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [isPending, startTransition] = useTransition();

  const counts = useMemo(() => ({
    total: batches.length,
    draft: batches.filter((batch) => batch.status === "draft").length,
    submitted: batches.filter((batch) => batch.status === "submitted").length,
  }), [batches]);

  const productFilterOptions = useMemo(
    () => products.map((product) => ({ value: product.id, label: product.productName })),
    [products],
  );

  const filtered = useMemo(() => {
    let next = batches;
    if (statusFilter === "pending") next = next.filter((batch) => batch.status === "draft");
    if (statusFilter === "submitted") next = next.filter((batch) => batch.status === "submitted");
    if (statusFilter === "exception") next = [];
    if (productFilter) next = next.filter((batch) => batch.productKey === productFilter);
    return next;
  }, [batches, productFilter, statusFilter]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filtered.length / pageSize)), [filtered.length, pageSize]);
  const visibleBatches = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  function refreshBatches() {
    router.refresh();
  }

  function exportBatches() {
    const header = ["ID", "批号", "产品", "检验者", "状态", "创建时间"];
    const rows = filtered.map((batch) => [
      String(batch.id),
      batch.batchNumber,
      batch.productName,
      batch.inspector || "-",
      statusLabel(batch.status),
      formatDate(batch.createdAt),
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
      const res = await fetch(workspacePath("/api/production/qc/batches"), {
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
      const res = await fetch(workspacePath(`/api/production/qc/batches/${target.id}`), { method: "DELETE" });
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
      <Toolbar
        viewControls={(
          <IconActionButton label="新建批次" variant="primary" onClick={() => setCreateOpen((open) => !open)}>
            +
          </IconActionButton>
        )}
        filters={(
          <>
            <ToolbarOptionGroup
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value);
                setPage(1);
              }}
              options={statusOptions}
            />
            <SelectField
              label="产品"
              value={productFilter}
              onChange={(value) => {
                setProductFilter(value);
                setPage(1);
              }}
              placeholder="全部"
              options={productFilterOptions}
              ariaLabel="筛选产品"
              size="toolbar"
              selectClassName="min-w-[7.5rem]"
            />
            <RefreshActionButton onClick={refreshBatches} />
          </>
        )}
        selectionActions={(
          <ActionButton onClick={exportBatches}>导出</ActionButton>
        )}
        meta={(
          <>
            <span>共 {filtered.length} 条 · 全部 {counts.total} · 待检 {counts.draft} · 已提交 {counts.submitted}</span>
            <SelectField
              options={pageSizeOptions}
              value={String(pageSize)}
              onChange={(value) => {
                setPageSize(Number(value));
                setPage(1);
              }}
              size="toolbar"
              selectClassName="!w-[6.5rem] !min-w-[6.5rem]"
              ariaLabel="每页条数"
            />
          </>
        )}
      />

      {createOpen && (
        <InlineCreatePanel
          title="新建批次"
          onSubmit={() => void createBatch()}
          onCancel={() => {
            setCreateOpen(false);
            setBatchNumber("");
          }}
          submitDisabled={isPending || !productKey || !batchNumber.trim()}
          submitting={isPending}
        >
          <FormField label="产品" required layout="inline">
            <SelectField
              value={productKey}
              onChange={setProductKey}
              options={products.map((product) => ({ value: product.id, label: product.productName }))}
              ariaLabel="产品"
              size="toolbar"
              selectClassName="!w-[7.5rem] !min-w-[7.5rem]"
            />
          </FormField>
          <FormField label="批号" required layout="inline">
            <TextField
              value={batchNumber}
              onChange={setBatchNumber}
              placeholder="请输入批号"
              className="w-36 rounded-lg border-2 border-emerald-500 px-3 shadow-sm focus:ring-2 focus:ring-emerald-100"
              style={{ width: "9rem" }}
            />
          </FormField>
        </InlineCreatePanel>
      )}

      <PanelCard title="批次记录">
        <TableScrollFrame>
          <DataTable
            rows={visibleBatches}
            columns={[
              ...batchColumns,
              {
                key: "actions",
                label: "操作",
                required: true,
                render: (batch) => (
                  <DataTableActionsCell
                    actions={[
                      {
                        key: "view",
                        label: "查看检验记录",
                        kind: "view",
                        onClick: () => router.push(`/production/qc/batches/${batch.id}`),
                      },
                      {
                        key: "delete",
                        label: "删除",
                        kind: "delete",
                        onClick: () => setPendingDelete(batch),
                      },
                    ]}
                  />
                ),
              },
            ]}
            visibleColumns={batchColumns.map((column) => column.key).concat("actions")}
            rowKey={(batch) => batch.id}
            emptyText="暂无批次记录。"
            tableClassName="min-w-[820px]"
          />
          <Pagination
            page={page}
            totalPages={totalPages}
            total={filtered.length}
            onPageChange={setPage}
            className="border-t border-slate-100"
            compact
          />
        </TableScrollFrame>
      </PanelCard>

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
