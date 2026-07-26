import type {
  FundFlowActivitySummary,
  FundFlowBalanceSignal,
  FundFlowChannel,
  FundFlowCompanySummary,
  FundFlowLedgerChannel,
} from "@workspace/finance/types";
import type { DataSurfaceColumnSpec, DataSurfaceDisplaySpec } from "@workspace/core/ui";
import { formatFinanceAmount } from "../formatters";

function money(value: number, signed = false): DataSurfaceDisplaySpec {
  const prefix = signed && value > 0 ? "+" : "";
  return {
    kind: "text",
    value: `${prefix}${formatFinanceAmount(value)}`,
    tone: value < -0.005 ? "danger" : signed && value > 0.005 ? "success" : "default",
    emphasis: signed && Math.abs(value) > 0.005 ? "medium" : "normal",
  };
}

function percent(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

export const activityColumns: DataSurfaceColumnSpec<FundFlowActivitySummary>[] = [
  { key: "label", label: "现金活动", required: true, emphasis: "medium", cell: (row) => row.label },
  { key: "inflow", label: "流入", required: true, align: "right", cell: (row) => formatFinanceAmount(row.inflow) },
  { key: "outflow", label: "流出", required: true, align: "right", cell: (row) => formatFinanceAmount(row.outflow) },
  { key: "net", label: "净额", required: true, align: "right", cell: (row) => money(row.net, true) },
  { key: "share", label: "流入占比", required: true, align: "right", tone: "muted", cell: (row) => percent(row.inflowShare) },
];

export const flowChannelColumns: DataSurfaceColumnSpec<FundFlowChannel>[] = [
  { key: "label", label: "项目", required: true, emphasis: "medium", cell: (row) => row.label },
  { key: "activity", label: "活动", required: true, cell: (row) => ({ kind: "badge", label: row.activity === "operating" ? "经营" : row.activity === "investing" ? "投资" : "筹资", tone: row.activity === "operating" ? "blue" : row.activity === "investing" ? "amber" : "gray" }) },
  { key: "amount", label: "金额", required: true, align: "right", cell: (row) => formatFinanceAmount(row.amount) },
  { key: "share", label: "占比", required: true, align: "right", tone: "muted", cell: (row) => percent(row.share) },
];

export const ledgerChannelColumns: DataSurfaceColumnSpec<FundFlowLedgerChannel>[] = [
  { key: "direction", label: "方向", required: true, cell: (row) => ({ kind: "badge", label: row.direction === "source" ? "来源" : "用途", tone: row.direction === "source" ? "green" : "amber" }) },
  { key: "label", label: "对手科目渠道", required: true, emphasis: "medium", cell: (row) => row.label },
  { key: "amount", label: "现金发生额", required: true, align: "right", cell: (row) => formatFinanceAmount(row.amount) },
  { key: "note", label: "识别依据", required: true, tone: "muted", cell: (row) => row.note },
];

export const balanceSignalColumns: DataSurfaceColumnSpec<FundFlowBalanceSignal>[] = [
  { key: "label", label: "资金信号", required: true, emphasis: "medium", cell: (row) => row.label },
  { key: "opening", label: "期初余额", required: true, align: "right", cell: (row) => formatFinanceAmount(row.opening) },
  { key: "change", label: "期间变化", required: true, align: "right", cell: (row) => money(row.change, true) },
  { key: "closing", label: "期末余额", required: true, align: "right", cell: (row) => formatFinanceAmount(row.closing) },
  { key: "note", label: "口径", required: true, tone: "muted", cell: (row) => row.note },
];

export const companyColumns: DataSurfaceColumnSpec<FundFlowCompanySummary>[] = [
  { key: "name", label: "公司", required: true, emphasis: "medium", cell: (row) => row.name },
  { key: "role", label: "集团角色", required: true, cell: (row) => ({ kind: "badge", label: row.role, tone: row.role === "母公司" ? "blue" : "gray" }) },
  { key: "inflow", label: "流入", required: true, align: "right", cell: (row) => formatFinanceAmount(row.inflow) },
  { key: "outflow", label: "流出", required: true, align: "right", cell: (row) => formatFinanceAmount(row.outflow) },
  { key: "net", label: "系统净变动", required: true, align: "right", cell: (row) => money(row.netCashChange, true) },
  { key: "ledgerNet", label: "流水净变动", required: true, align: "right", cell: (row) => money(row.ledgerNetCashChange, true) },
  { key: "endingCash", label: "期末货币资金", required: true, align: "right", cell: (row) => formatFinanceAmount(row.endingCash) },
  { key: "quality", label: "核对", required: true, cell: (row) => ({ kind: "badge", label: row.quality === "ok" ? "一致" : row.quality === "missing" ? "缺少系统分类" : "待复核", tone: row.quality === "ok" ? "green" : row.quality === "missing" ? "red" : "amber" }) },
];
