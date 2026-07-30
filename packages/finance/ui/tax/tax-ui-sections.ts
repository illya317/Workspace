import {
  createEmptySection,
  createMessageSection,
  createMetricsSection,
  createPageTableSection,
  type BodySurfaceSectionSpec,
  type DataSurfaceDisplaySpec,
  type DataSurfaceColumnSpec,
} from "@workspace/core/ui";

import type {
  AccrualLineRow,
  FilingRow,
  PaymentAllocationRow,
  PaymentRow,
  RegistrationRow,
  SnapshotRow,
  TaxWorkspace,
  WorkpaperRow,
} from "./tax-ui-model";
import { registrationLabel } from "./tax-ui-model";

export function taxAccrualSections(input: {
  workspace: TaxWorkspace;
  canUpdate: boolean;
  onEditRegistration: (row: RegistrationRow) => void;
  onEditWorkpaper: (row: WorkpaperRow) => void;
}): BodySurfaceSectionSpec[] {
  const { workspace } = input;
  const lines = workspace.workpapers.flatMap((workpaper) => workpaper.accrualLines.map((line) => ({ workpaper, line })));
  return [
    createMetricsSection("tax-accrual-metrics", {
      metrics: [
        { key: "registrations", label: "纳税登记", value: workspace.registrations.length },
        { key: "workpapers", label: "计税底稿", value: workspace.workpapers.length },
        { key: "calculated", label: "本期计税金额", value: amount(workspace.workpapers.reduce((sum, row) => sum + (row.calculatedAmount ?? 0), 0)) },
        { key: "difference", label: "来源差异", value: amount(workspace.workpapers.reduce((sum, row) => sum + (row.sourceDifference ?? 0), 0)) },
      ],
    }),
    createPageTableSection("tax-registrations", {
      rows: workspace.registrations,
      columns: registrationColumns,
      rowKey: (row) => row.id,
      emptyText: "当前公司暂无纳税登记",
      rowActions: input.canUpdate ? (row) => [{ key: `edit-registration-${row.id}`, kind: "edit", label: "编辑纳税登记", onClick: () => input.onEditRegistration(row) }] : undefined,
      actionsColumn: input.canUpdate ? { label: "操作" } : undefined,
    }),
    createPageTableSection("tax-workpapers", {
      rows: workspace.workpapers,
      columns: workpaperColumns(workspace),
      rowKey: (row) => row.id,
      emptyText: "当前期间暂无计税底稿",
      rowActions: input.canUpdate ? (row) => [{ key: `edit-workpaper-${row.id}`, kind: "edit", label: "编辑计税底稿", onClick: () => input.onEditWorkpaper(row) }] : undefined,
      actionsColumn: input.canUpdate ? { label: "操作" } : undefined,
    }),
    ...(lines.length > 0 ? [createPageTableSection("tax-accrual-lines", {
      rows: lines,
      columns: accrualLineColumns(workspace),
      rowKey: ({ line }) => line.id,
      emptyText: "暂无计税明细",
    })] : []),
  ];
}

export function taxFilingPaymentSections(input: {
  workspace: TaxWorkspace;
  canUpdate: boolean;
  onEditFiling: (row: FilingRow) => void;
}): BodySurfaceSectionSpec[] {
  const { workspace } = input;
  const allocations = workspace.payments.flatMap((payment) => payment.allocations.map((allocation) => ({ payment, allocation })));
  return [
    createMetricsSection("tax-filing-metrics", {
      metrics: [
        { key: "filings", label: "申报记录", value: workspace.filings.length },
        { key: "payable", label: "应缴金额", value: amount(workspace.filings.reduce((sum, row) => sum + (row.reconciliation.payableAmount ?? 0), 0)) },
        { key: "paid", label: "已缴金额", value: amount(workspace.filings.reduce((sum, row) => sum + (row.reconciliation.paidAmount ?? 0), 0)) },
        { key: "unallocated", label: "未分配缴款", value: amount(workspace.payments.reduce((sum, row) => sum + row.unallocatedAmount, 0)) },
      ],
    }),
    createPageTableSection("tax-filings", {
      rows: workspace.filings,
      columns: filingColumns(workspace),
      rowKey: (row) => row.id,
      emptyText: "当前期间暂无申报记录",
      rowActions: input.canUpdate ? (row) => [{ key: `edit-filing-${row.id}`, kind: "edit", label: "编辑申报", onClick: () => input.onEditFiling(row) }] : undefined,
      actionsColumn: input.canUpdate ? { label: "操作" } : undefined,
    }),
    createPageTableSection("tax-payments", {
      rows: workspace.payments,
      columns: paymentColumns,
      rowKey: (row) => row.id,
      emptyText: "当前期间暂无缴款记录",
    }),
    ...(allocations.length > 0 ? [createPageTableSection("tax-payment-allocations", {
      rows: allocations,
      columns: allocationColumns(workspace),
      rowKey: ({ payment, allocation }, index) => allocation.id ?? `${payment.id}-${allocation.filingId}-${index}`,
      emptyText: "暂无申报分配",
    })] : []),
  ];
}

export function taxReconciliationSections(workspace: TaxWorkspace): BodySurfaceSectionSpec[] {
  return [
    createMetricsSection("tax-reconciliation-metrics", {
      metrics: [
        { key: "blockers", label: "阻断项", value: workspace.blockers.length },
        { key: "evidence", label: "证据引用", value: workspace.evidenceRefs.length },
        { key: "snapshots", label: "勾稽快照", value: workspace.reconciliationSnapshots.length },
        { key: "payment-difference", label: "应缴与实缴差异", value: amount(workspace.filings.reduce((sum, row) => sum + (row.reconciliation.payableToPaidDifference ?? 0), 0)) },
      ],
    }),
    ...(workspace.blockers.length > 0 ? [
      createMessageSection("tax-blocker-message", { content: "当前期间存在税务关账阻断项", tone: "warning" }),
      createPageTableSection("tax-blockers", {
        rows: workspace.blockers,
        columns: blockerColumns,
        rowKey: (row, index) => `${index}-${row.message}-${row.deepLink}`,
        emptyText: "当前期间无阻断项",
      }),
    ] : [createMessageSection("tax-clear-message", { content: "当前期间未发现税务关账阻断项", tone: "success" })]),
    createPageTableSection("tax-reconciliation-filing", {
      rows: workspace.filings,
      columns: reconciliationColumns(workspace),
      rowKey: (row) => row.id,
      emptyText: "当前期间暂无可勾稽申报",
    }),
    ...(workspace.reconciliationSnapshots.length > 0 ? [createPageTableSection("tax-snapshots", {
      rows: workspace.reconciliationSnapshots,
      columns: snapshotColumns(workspace),
      rowKey: (row) => row.id,
      emptyText: "暂无勾稽快照",
    })] : []),
    ...(workspace.evidenceRefs.length > 0
      ? [createMessageSection("tax-evidence-summary", { content: `当前期间已关联 ${workspace.evidenceRefs.length} 项来源证据`, tone: "default" })]
      : [createEmptySection("tax-evidence-empty", { content: "当前期间暂无来源证据", presentation: "card" })]),
  ];
}

const registrationColumns: DataSurfaceColumnSpec<RegistrationRow>[] = [
  { key: "taxType", label: "税种", cell: (row) => row.taxType?.name ?? "未识别税种" },
  { key: "registrationNo", label: "登记号", cell: (row) => row.registrationNo, font: "mono" },
  { key: "jurisdiction", label: "税辖区", cell: (row) => row.jurisdiction },
  { key: "filingFrequency", label: "频率", cell: (row) => frequencyLabel(row.filingFrequency) },
  { key: "effective", label: "有效期", cell: (row) => `${row.effectiveFrom}${row.effectiveThrough ? ` 至 ${row.effectiveThrough}` : " 起"}` },
  { key: "status", label: "状态", cell: (row) => status(row.status) },
];

function workpaperColumns(workspace: TaxWorkspace): DataSurfaceColumnSpec<WorkpaperRow>[] {
  return [
    { key: "registration", label: "纳税登记", cell: (row) => registrationLabel(row.registrationId, workspace) },
    { key: "status", label: "状态", cell: (row) => status(row.status) },
    { key: "lines", label: "明细", cell: (row) => ({ kind: "number", value: row.accrualLines.length }) },
    { key: "calculatedAmount", label: "计税金额", align: "right", cell: (row) => amount(row.calculatedAmount) },
    { key: "sourceReportedAmount", label: "来源税额", align: "right", cell: (row) => amount(row.sourceReportedAmount) },
    { key: "sourceDifference", label: "来源差异", align: "right", cell: (row) => difference(row.sourceDifference) },
  ];
}

function accrualLineColumns(workspace: TaxWorkspace): DataSurfaceColumnSpec<{ workpaper: WorkpaperRow; line: AccrualLineRow }>[] {
  return [
    { key: "workpaper", label: "纳税登记", cell: ({ workpaper }) => registrationLabel(workpaper.registrationId, workspace) },
    { key: "lineNo", label: "行号", cell: ({ line }) => ({ kind: "number", value: line.lineNo }) },
    { key: "description", label: "计税说明", cell: ({ line }) => line.description },
    { key: "method", label: "方法", cell: ({ line }) => line.method === "base_rate" ? "基础 × 税率" : "数量 × 单位税额 ÷ 除数" },
    { key: "calculated", label: "计算税额", align: "right", cell: ({ line }) => amount(line.calculatedAmount) },
    { key: "reported", label: "来源税额", align: "right", cell: ({ line }) => amount(line.sourceReportedAmount) },
    { key: "difference", label: "差异", align: "right", cell: ({ line }) => difference(line.sourceDifference) },
    { key: "voucher", label: "凭证明细", cell: ({ line }) => line.voucherItemLabel ?? "未关联" },
  ];
}

function filingColumns(workspace: TaxWorkspace): DataSurfaceColumnSpec<FilingRow>[] {
  return [
    { key: "registration", label: "纳税登记", cell: (row) => registrationLabel(row.registrationId, workspace) },
    { key: "reference", label: "申报回执", cell: (row) => filingDisplayLabel(row, workspace) },
    { key: "status", label: "状态", cell: (row) => status(row.status) },
    { key: "filedOn", label: "申报日期", cell: (row) => row.filedOn ?? "—" },
    { key: "declared", label: "申报金额", align: "right", cell: (row) => amount(row.reconciliation.declaredAmount) },
    { key: "payable", label: "应缴金额", align: "right", cell: (row) => amount(row.reconciliation.payableAmount) },
    { key: "paid", label: "已缴金额", align: "right", cell: (row) => amount(row.reconciliation.paidAmount) },
    { key: "currency", label: "币种", cell: (row) => row.currencyCode, font: "mono" },
  ];
}

const paymentColumns: DataSurfaceColumnSpec<PaymentRow>[] = [
  { key: "kind", label: "类型", cell: (row) => paymentKindLabel(row.paymentKind) },
  { key: "paidOn", label: "日期", cell: (row) => row.paidOn },
  { key: "reference", label: "缴款凭证", cell: (row) => paymentDisplayLabel(row) },
  { key: "amount", label: "金额", align: "right", cell: (row) => amount(row.amount) },
  { key: "allocated", label: "已分配", align: "right", cell: (row) => amount(row.allocatedAmount) },
  { key: "unallocated", label: "未分配", align: "right", cell: (row) => difference(row.unallocatedAmount) },
  { key: "currency", label: "币种", cell: (row) => row.currencyCode, font: "mono" },
];

function allocationColumns(workspace: TaxWorkspace): DataSurfaceColumnSpec<{ payment: PaymentRow; allocation: PaymentAllocationRow }>[] {
  return [
    { key: "payment", label: "缴款", cell: ({ payment }) => paymentDisplayLabel(payment) },
    { key: "filing", label: "申报", cell: ({ allocation }) => allocationFilingLabel(allocation, workspace) },
    { key: "allocated", label: "分配金额", align: "right", cell: ({ allocation }) => amount(allocation.allocatedAmount) },
    { key: "voucher", label: "凭证明细", cell: ({ allocation }) => allocation.voucherItemLabel ?? "未关联" },
  ];
}

const blockerColumns: DataSurfaceColumnSpec<TaxWorkspace["blockers"][number]>[] = [
  { key: "message", label: "阻断事项", cell: (row) => ({ kind: "text", value: row.message, tone: "warning", wrap: "wrap" }) },
  { key: "deepLink", label: "定位", cell: (row) => ({ kind: "link", label: "打开当前范围", href: row.deepLink }) },
];

function reconciliationColumns(workspace: TaxWorkspace): DataSurfaceColumnSpec<FilingRow>[] {
  return [
    { key: "registration", label: "纳税登记", cell: (row) => registrationLabel(row.registrationId, workspace) },
    { key: "calculated", label: "计税", align: "right", cell: (row) => amount(row.reconciliation.calculatedAmount) },
    { key: "declared", label: "申报", align: "right", cell: (row) => amount(row.reconciliation.declaredAmount) },
    { key: "payable", label: "应缴", align: "right", cell: (row) => amount(row.reconciliation.payableAmount) },
    { key: "paid", label: "实缴", align: "right", cell: (row) => amount(row.reconciliation.paidAmount) },
    { key: "calc-declared", label: "计税/申报差异", align: "right", cell: (row) => difference(row.reconciliation.calculatedToDeclaredDifference) },
    { key: "declared-payable", label: "申报/应缴差异", align: "right", cell: (row) => difference(row.reconciliation.declaredToPayableDifference) },
    { key: "payable-paid", label: "应缴/实缴差异", align: "right", cell: (row) => difference(row.reconciliation.payableToPaidDifference) },
  ];
}

function snapshotColumns(workspace: TaxWorkspace): DataSurfaceColumnSpec<SnapshotRow>[] {
  return [
    { key: "registration", label: "纳税登记", cell: (row) => registrationLabel(row.registrationId, workspace) },
    { key: "status", label: "状态", cell: (row) => status(row.status) },
    { key: "capturedAt", label: "冻结时间", cell: (row) => row.capturedAt },
  ];
}

function filingDisplayLabel(row: FilingRow, workspace: TaxWorkspace) {
  if (row.filingReference) return row.filingReference;
  return `${registrationLabel(row.registrationId, workspace)} · ${row.filedOn ?? "未填写申报日期"} · ${statusLabel(row.status)}`;
}

function paymentDisplayLabel(row: PaymentRow) {
  return row.paymentReference || `${paymentKindLabel(row.paymentKind)} · ${row.paidOn}`;
}

function allocationFilingLabel(allocation: PaymentAllocationRow, workspace: TaxWorkspace) {
  const filing = workspace.filings.find((row) => row.id === allocation.filingId);
  if (!filing) return "未找到申报记录";
  return filing.filingReference || registrationLabel(filing.registrationId, workspace);
}

function status(value: string): DataSurfaceDisplaySpec {
  const success = ["active", "prepared", "reconciled", "filed", "accepted", "clear", "complete"].includes(value);
  const danger = ["blocked", "cancelled", "ended"].includes(value);
  return { kind: "badge", label: statusLabel(value), tone: success ? "green" : danger ? "red" : "gray" };
}

function amount(value: number | null | undefined): DataSurfaceDisplaySpec {
  return { kind: "amount", value, currencySymbol: "", showZero: true };
}

function difference(value: number | null | undefined): DataSurfaceDisplaySpec {
  if (value == null) return { kind: "empty", content: "—" };
  return { kind: "text", value: value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), tone: Math.abs(value) > 0.01 ? "warning" : "success", font: "mono" };
}

function frequencyLabel(value: RegistrationRow["filingFrequency"]) {
  return { monthly: "月度", quarterly: "季度", annual: "年度", event: "按事项" }[value];
}

function paymentKindLabel(value: PaymentRow["paymentKind"]) {
  return { payment: "缴款", refund: "退税", reversal: "冲销" }[value];
}

function statusLabel(value: string) {
  return ({
    draft: "草稿", active: "启用", suspended: "暂停", ended: "终止",
    prepared: "已编制", reconciled: "已勾稽", blocked: "阻断",
    filed: "已申报", accepted: "已受理", amended: "已更正", cancelled: "已取消",
    clear: "无差异", complete: "完成",
  } as Record<string, string>)[value] ?? value;
}
