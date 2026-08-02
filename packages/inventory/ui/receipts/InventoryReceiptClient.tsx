"use client";

import { workspacePath } from "@workspace/core/routing";
import { resolveActionRuntime } from "@workspace/platform/workflow-action-runtime";
import { actionRuntimeCommands, workflowActionHeaderCommands } from "@workspace/platform/ui";
import { useTenantConfig } from "@workspace/platform/ui/tenant-config";
import {
  PageSurface,
  createMasterDetailBody,
  createEmptySection,
  createFieldsSection,
  createPageBody,
  createPageTabBar,
  useFeedback,
  type PageSurfaceCreateSpec,
  type SelectorSurfaceProps,
  type SurfaceToolbarItems,
} from "@workspace/core/ui";
import { useCallback, useEffect, useState } from "react";
import type { InventoryReceiptList, InventoryReceiptRow } from "@workspace/inventory/types";
import { normalizeProductionBatchNumberInput } from "@workspace/platform/production-batch-number";
import {
  applyInventoryReceiptCatalogChange,
  inventoryReceiptEditDraft,
  inventoryReceiptFormFields,
  inventoryReceiptFormSections,
  inventoryReceiptNumberText,
  type InventoryReceiptDraft,
  validInventoryReceiptDraft,
} from "./InventoryReceiptForm";
import { buildInventoryReceiptSummarySection } from "./InventoryReceiptSummary";

type ReceiptTab = "summary" | "entry";

export type InventoryReceiptClientProps = {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  currentUserId: number;
  currentUserName: string;
};

function monthPeriodValue(year: string, month: string) {
  return year && month ? `${year}-${month.padStart(2, "0")}` : null;
}

function splitMonthPeriod(value: string | null) {
  if (!value) return { year: "", month: "" };
  const [year, month] = value.split("-");
  return { year: year ?? "", month: month ? String(Number(month)) : "" };
}

export default function InventoryReceiptClient({ canCreate, canUpdate, canDelete, canSubmit, canApprove, currentUserId, currentUserName }: InventoryReceiptClientProps) {
  const businessTimeZone = useTenantConfig().localization.businessTimeZone;
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [summaryYear, setSummaryYear] = useState(String(currentYear));
  const [summaryMonth, setSummaryMonth] = useState("");
  const [entryYear, setEntryYear] = useState(String(currentYear));
  const [entryMonth, setEntryMonth] = useState(String(currentMonth));
  const [q, setQ] = useState("");
  const [activeTab, setActiveTab] = useState<ReceiptTab>("summary");
  const [data, setData] = useState<InventoryReceiptList>({
    rows: [],
    reports: [],
    summary: null,
    years: [],
    productCatalog: [],
    total: 0,
    reportCount: 0,
    productCatalogCount: 0,
    packagingNoteCount: 0,
    auditIssueCount: 0,
  });
  const [draft, setDraft] = useState<InventoryReceiptDraft | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<InventoryReceiptDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const feedback = useFeedback({ unsavedChanges: dirty });
  const activeYear = activeTab === "summary" ? summaryYear : entryYear;
  const activeMonth = activeTab === "summary" ? summaryMonth : entryMonth;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeYear) params.set("year", activeYear);
      if (activeMonth) params.set("month", activeMonth);
      if (activeTab === "entry" && q.trim()) params.set("q", q.trim());
      const response = await fetch(workspacePath(`/api/modules/inventory/receipts?${params.toString()}`));
      const raw = await response.text();
      let payload: (InventoryReceiptList & { error?: string }) | null = null;
      try { payload = raw ? JSON.parse(raw) as InventoryReceiptList & { error?: string } : null; }
      catch { throw new Error("成品入库报单接口返回格式异常"); }
      if (!response.ok) throw new Error(payload?.error || `成品入库报单数据加载失败（${response.status}）`);
      if (!payload) throw new Error("成品入库报单接口返回空响应，请刷新后重试");
      setData(payload);
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "成品入库报单数据加载失败");
    } finally { setLoading(false); }
  }, [activeMonth, activeTab, activeYear, feedback, q]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (activeTab !== "summary" || !data.summary || (summaryYear && summaryMonth)) return;
    setSummaryYear(String(data.summary.report.year));
    setSummaryMonth(String(data.summary.report.month));
  }, [activeTab, data.summary, summaryMonth, summaryYear]);

  useEffect(() => {
    const selected = data.rows.find((row) => row.id === selectedId);
    if (selected) {
      if (!dirty && (editing?.id !== selected.id || editing.version !== selected.version)) setEditing(inventoryReceiptEditDraft(selected));
      return;
    }
    const first = data.rows[0] ?? null;
    setSelectedId(first?.id ?? null);
    setEditing(first ? inventoryReceiptEditDraft(first) : null);
    setDirty(false);
  }, [data.rows, dirty, editing?.id, editing?.version, selectedId]);

  const entryPeriodReport = data.reports.find((report) => report.year === Number(entryYear) && report.month === Number(entryMonth));
  const entryPeriodLocked = Boolean(entryPeriodReport && !entryPeriodReport.canEdit);
  const entryToolbarItems: SurfaceToolbarItems = [
    { kind: "search", key: "search", value: q, onChange: setQ, placeholder: "搜索品种、规格或批号" },
    { kind: "period", key: "period", mode: "month", value: monthPeriodValue(entryYear, entryMonth), onChange: (value) => {
      const period = splitMonthPeriod(value);
      setEntryYear(period.year);
      setEntryMonth(period.month);
    }, placeholder: "全部年月" },
    { kind: "text", key: "count", content: `共 ${data.total} 条` },
    ...(entryPeriodLocked ? [{ kind: "text" as const, key: "period-lock", content: "该月已确认，仅可查看" }] : []),
  ];
  const summaryToolbarItems: SurfaceToolbarItems = [
    { kind: "period", key: "period", mode: "month", value: monthPeriodValue(summaryYear, summaryMonth), onChange: (value) => {
      const period = splitMonthPeriod(value);
      setSummaryYear(period.year);
      setSummaryMonth(period.month);
    }, placeholder: "选择年月" },
  ];

  function emptyDraft(): InventoryReceiptDraft {
    return {
      year: Number(entryYear || currentYear),
      month: Number(entryMonth || currentMonth),
      productId: 0,
      productName: "",
      specification: "",
      batchNumber: "",
      inputQuantityTenThousands: "",
      caseQuantity: "",
      extraPackageQuantity: "",
      packagingNote: "",
      workPoints: "",
    };
  }

  async function request(method: "POST" | "PATCH", value: InventoryReceiptDraft) {
    const url = method === "POST" ? "/api/modules/inventory/receipts" : `/api/modules/inventory/receipts/${value.id}`;
    const response = await fetch(workspacePath(url), { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
    const payload = await response.json().catch(() => null) as { error?: string; id?: number } | null;
    if (!response.ok) throw new Error(payload?.error || "保存失败");
    return payload;
  }

  async function createRecord() {
    if (!draft) return;
    setSaving(true);
    try {
      const result = await request("POST", draft);
      setDraft(null);
      setDirty(false);
      await load();
      if (result?.id) setSelectedId(result.id);
      return { outcome: "saved" as const, message: "成品入库报单记录已新增" };
    }
    finally { setSaving(false); }
  }

  async function updateRecord() {
    if (!editing) return;
    setSaving(true);
    try { await request("PATCH", editing); setDirty(false); await load(); feedback.success("成品入库报单记录已更新"); }
    catch (error) { feedback.error(error instanceof Error ? error.message : "保存失败"); }
    finally { setSaving(false); }
  }

  async function deleteRecord(row: InventoryReceiptRow) {
    if (!await feedback.confirmDelete({ message: `确定删除 ${row.batchNumber} 的这条产量记录吗？` })) return;
    const response = await fetch(workspacePath(`/api/modules/inventory/receipts/${row.id}`), { method: "DELETE", headers: { "If-Match": String(row.version) } });
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) { feedback.error(payload?.error || "删除失败"); return; }
    setSelectedId(null);
    setEditing(null);
    setDirty(false);
    feedback.success("已删除"); await load();
  }

  async function runReportAction(action: "confirm" | "review") {
    const report = data.summary?.report;
    if (!report) return;
    setSaving(true);
    try {
      const response = await fetch(workspacePath(`/api/modules/inventory/receipts/reports/${report.id}/${action}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: report.version }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || (action === "confirm" ? "汇总确认失败" : "汇总复核失败"));
      feedback.success(action === "confirm" ? "月度汇总已确认，等待独立复核" : "月度汇总已复核");
      await load();
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "操作失败");
    } finally { setSaving(false); }
  }

  function changeDraft(key: keyof InventoryReceiptDraft, value: unknown) {
    if (key === "batchId") {
      const batchId = Number(value) || undefined;
      const base = data.rows.find((row) => row.batchId === batchId);
      setDraft((current) => current && base ? {
        ...current, batchId, year: base.year, month: base.month,
        productId: base.productId ?? 0, productName: base.productName, specification: base.specification ?? "", batchNumber: base.batchNumber,
        inputQuantityTenThousands: base.inputQuantityTenThousands === null ? "" : String(base.inputQuantityTenThousands),
        packagingNote: base.packagingNote,
        productWorkPointId: base.productWorkPointId ?? undefined,
        productWorkPointVersion: base.productWorkPointVersion ?? undefined,
        workPoints: base.workPoints === null ? "" : String(base.workPoints),
      } : current ? {
        ...current,
        batchId: undefined,
        productId: 0,
        productName: "",
        specification: "",
        batchNumber: "",
        inputQuantityTenThousands: "",
        productWorkPointId: undefined,
        productWorkPointVersion: undefined,
        workPoints: "",
      } : current);
      return;
    }
    setDraft((current) => {
      if (!current) return current;
      if (key === "productId") {
        const productId = Number(value) || 0;
        const next = applyInventoryReceiptCatalogChange(current, productId, data.productCatalog);
        const productWorkPoint = data.rows.find((row) => row.year === current.year && row.month === current.month && row.productId === productId);
        return {
          ...next,
          productWorkPointId: productWorkPoint?.productWorkPointId ?? undefined,
          productWorkPointVersion: productWorkPoint?.productWorkPointVersion ?? undefined,
          workPoints: productWorkPoint?.workPoints === null || productWorkPoint?.workPoints === undefined ? "" : String(productWorkPoint.workPoints),
        };
      }
      if (key === "packagingNote") return { ...current, packagingNote: String(value ?? ""), extraPackageQuantity: "" };
      return { ...current, [key]: key === "year" || key === "month" ? Number(value) : key === "batchNumber" ? normalizeProductionBatchNumberInput(value) : String(value ?? "") } as InventoryReceiptDraft;
    });
  }

  function changeEditing(key: keyof InventoryReceiptDraft, value: unknown) {
    setEditing((current) => {
      if (!current) return current;
      if (key === "productId") {
        const productId = Number(value) || 0;
        const next = applyInventoryReceiptCatalogChange(current, productId, data.productCatalog);
        const productWorkPoint = data.rows.find((row) => row.year === current.year && row.month === current.month && row.productId === productId);
        return {
          ...next,
          productWorkPointId: productWorkPoint?.productWorkPointId ?? undefined,
          productWorkPointVersion: productWorkPoint?.productWorkPointVersion ?? undefined,
          workPoints: productWorkPoint?.workPoints === null || productWorkPoint?.workPoints === undefined ? "" : String(productWorkPoint.workPoints),
        };
      }
      if (key === "packagingNote") return { ...current, packagingNote: String(value ?? ""), extraPackageQuantity: "" };
      return { ...current, [key]: key === "year" || key === "month" ? Number(value) : key === "batchNumber" ? normalizeProductionBatchNumberInput(value) : String(value ?? "") } as InventoryReceiptDraft;
    });
    setDirty(true);
  }

  async function selectRow(row: InventoryReceiptRow) {
    if (row.id === selectedId && !draft) return;
    if (dirty && !await feedback.confirmLeave()) return;
    setDraft(null);
    setSelectedId(row.id);
    setEditing(inventoryReceiptEditDraft(row));
    setDirty(false);
  }

  function resetEditing() {
    const selected = data.rows.find((row) => row.id === selectedId);
    setEditing(selected ? inventoryReceiptEditDraft(selected) : null);
    setDirty(false);
  }

  const selectedRow = data.rows.find((row) => row.id === selectedId) ?? null;
  const selectedReport = selectedRow ? data.reports.find((report) => report.id === selectedRow.reportId) ?? null : null;
  const canEditSelected = Boolean(selectedReport?.canEdit);
  const selector: SelectorSurfaceProps<InventoryReceiptRow> = {
    kind: "list",
    title: "成品入库报单记录",
    selectedId,
    loading,
    loadingText: "加载中…",
    emptyText: "当前筛选范围暂无成品入库报单记录",
    items: data.rows.map((row) => ({
      key: row.id,
      value: row,
      group: `${row.year}年${row.month}月`,
      card: {
        title: row.productName,
        subtitle: `${row.specification ?? "无规格"} · ${row.productionQuantityText ?? "未完工"}`,
        code: row.batchNumber,
        meta: [`投料 ${inventoryReceiptNumberText(row.inputQuantityTenThousands)}`, `工分 ${inventoryReceiptNumberText(row.workPoints)}`],
        trailing: `折合 ${inventoryReceiptNumberText(row.convertedTenThousands)} 万粒/片`,
        status: row.auditStatus === "formula_error"
          ? { label: "源折合有误", tone: "danger" }
          : row.auditStatus === "warning"
            ? { label: "待复核", tone: "warning" }
            : { label: "一致", tone: "success" },
        tone: row.auditStatus === "formula_error" ? "amber" : "slate",
      },
    })),
    onSelect: (row) => void selectRow(row),
  };

  const pageCreate: PageSurfaceCreateSpec = {
      id: "inventory-receipts-create", presentation: "block", title: draft?.batchId ? "同批号新增产量" : "新增成品入库报单记录",
      open: Boolean(draft), canCreate, disabled: saving || entryPeriodLocked,
      content: { kind: "sections", sections: inventoryReceiptFormSections(draft ?? emptyDraft(), changeDraft, data.rows, data.productCatalog) },
      submission: { action: "save", disabled: saving || !validInventoryReceiptDraft(draft), execute: createRecord },
      onOpenChange: (open: boolean) => setDraft(open ? emptyDraft() : null), onCancel: () => setDraft(null),
    };

  const detailSection = editing && selectedRow
    ? createFieldsSection("inventory-receipts-edit", inventoryReceiptFormFields(editing, changeEditing, false, [], data.productCatalog, !canUpdate || !canEditSelected, true), {
        header: {
          title: `${selectedRow.productName} · ${selectedRow.batchNumber}`,
          description: `${selectedRow.year}年${selectedRow.month}月 · 本月产品工分 ${inventoryReceiptNumberText(selectedRow.workPoints)} · 折合 ${inventoryReceiptNumberText(selectedRow.convertedPackages)} ${selectedRow.packageUnit} · ${inventoryReceiptNumberText(selectedRow.convertedTenThousands)} 万粒/片。${canEditSelected ? "品种、规格、批号及投料量由同批号记录共享；工分由本月同产品的全部记录共享。" : "该月汇总已确认，历史数据已锁定；请选择未确认月份继续填写。"}`,
        },
        layout: { columns: 2, density: "compact" },
        submit: canUpdate && canEditSelected ? { onSubmit: updateRecord } : undefined,
        actions: [
          ...(canUpdate && canEditSelected ? [
            { key: "reset", action: "reset" as const, label: "撤销修改", disabled: saving || !dirty, onClick: resetEditing },
            { key: "save", action: "save" as const, label: saving ? "保存中…" : "保存", disabled: saving || !dirty || !validInventoryReceiptDraft(editing), onClick: () => void updateRecord() },
          ] : []),
          ...(canDelete && canEditSelected ? [{ key: "delete", action: "delete" as const, label: "删除", disabled: saving, onClick: () => void deleteRecord(selectedRow) }] : []),
        ],
      })
    : createEmptySection("inventory-receipts-empty", { content: "从左侧选择一条记录查看和修改", presentation: "card" });

  const normalizedCurrentUserName = currentUserName.replace(/\s+/g, "");
  const summary = data.summary;
  const currentUserIsPreparer = summary?.report.preparedByUserId !== null
    ? summary?.report.preparedByUserId === currentUserId
    : summary?.report.preparedBy?.replace(/\s+/g, "") === normalizedCurrentUserName;
  const summaryActionRuntime = summary?.report.status === "draft"
    ? resolveActionRuntime({
        businessActionKey: "inventory.receipts.report.confirm",
        workflowPolicyMode: "required",
        workflowWhenDisabled: "unavailable",
        actor: { userId: currentUserId, canStartWorkflow: canSubmit },
      })
    : summary?.report.status === "submitted"
      ? resolveActionRuntime({
          businessActionKey: "inventory.receipts.report.review",
          workflowPolicyMode: "required",
          workflowWhenDisabled: "unavailable",
          actor: { userId: currentUserId, canProcessWorkflow: canApprove && summary.snapshotCurrent },
          request: {
            id: summary.report.id,
            status: "submitted",
            submitterUserId: currentUserIsPreparer ? currentUserId : summary.report.preparedByUserId ?? 0,
            handlerCanRevise: false,
            requestCanWithdraw: false,
            requestCanResubmit: false,
            requestCanCancel: false,
            requestCanRevise: false,
          },
        })
      : null;
  const summaryActions = workflowActionHeaderCommands(actionRuntimeCommands(summaryActionRuntime, {
    "workflow.request.submit": { label: saving ? "确认中…" : "保存并确认", disabled: saving || loading, onClick: () => void runReportAction("confirm") },
    "workflow.request.approve": { label: saving ? "复核中…" : "复核通过", disabled: saving || loading, onClick: () => void runReportAction("review") },
  }));
  const summaryBody = summary
    ? createPageBody([buildInventoryReceiptSummarySection(summary, summaryActions, businessTimeZone)])
    : createPageBody([createEmptySection("inventory-receipts-summary-empty", { content: loading ? "正在加载月度汇总…" : "当前月份暂无成品入库报单数据", presentation: "card" })]);
  const entryBody = createMasterDetailBody({
    master: { label: "成品入库报单记录", presentation: "compact", body: { kind: "selector", selector } },
    detail: createPageBody(draft ? [] : [detailSection]),
    desktop: { ratio: [1, 2] },
    mobile: { detailActive: Boolean(draft || editing) },
  });

  async function changeTab(next: ReceiptTab) {
    if (next === activeTab) return;
    if (dirty && !await feedback.confirmLeave()) return;
    setDraft(null);
    setDirty(false);
    setActiveTab(next);
  }

  return <PageSurface
    kind="standard"
    create={activeTab === "entry" ? pageCreate : undefined}
    tabbar={createPageTabBar({
      items: [{ key: "summary", label: "汇总表" }, { key: "entry", label: "数据填写" }],
      active: activeTab,
      onChange: (key) => void changeTab(key as ReceiptTab),
      ariaLabel: "成品入库报单视图",
    })}
    toolbar={{ items: activeTab === "summary" ? summaryToolbarItems : entryToolbarItems }}
    body={activeTab === "summary" ? summaryBody : entryBody}
  />;
}
