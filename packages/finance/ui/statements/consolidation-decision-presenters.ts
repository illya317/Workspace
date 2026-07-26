import type {
  DataSurfaceColumnSpec,
  FormSurfaceFieldSpec,
} from "@workspace/core/ui";
import type {
  ConsolidationBatchEventSnapshot,
  ConsolidationControlKey,
  ConsolidationEntrySnapshot,
  ConsolidationEntryType,
} from "@workspace/finance/types";
import type { ReactNode } from "react";

export const REPORT_OPTIONS = [
  { value: "balanceSheet", label: "资产负债表" },
  { value: "incomeStatement", label: "利润表" },
  { value: "cashFlow", label: "现金流量表" },
];

export const ENTRY_TYPE_OPTIONS: { value: ConsolidationEntryType; label: string }[] = [
  { value: "investmentEquity", label: "投资与权益" },
  { value: "nonControllingInterest", label: "少数股东" },
  { value: "intercompanyBalance", label: "内部往来" },
  { value: "internalTrading", label: "内部交易" },
  { value: "internalLongTermAsset", label: "内部长期资产" },
  { value: "incomeDividend", label: "收益、利息与股利" },
  { value: "cashFlow", label: "内部现金流" },
];

export const CONTROL_OPTIONS: { value: ConsolidationControlKey; label: string }[] = [
  { value: "scope", label: "合并范围" },
  { value: "ownership", label: "股权与少数股东口径" },
  { value: "sources", label: "个别三表来源" },
  { value: "fx", label: "外币折算" },
  ...ENTRY_TYPE_OPTIONS.map((option) => ({ value: `elimination:${option.value}` as const, label: `${option.label}抵销` })),
  { value: "tax", label: "税务影响" },
];

export const MATCH_SOURCE_OPTIONS = [
  { value: "auxiliaryBalance", label: "辅助核算余额" },
  { value: "openItem", label: "往来未清项" },
  { value: "cashFlowAllocation", label: "现金流分配" },
  { value: "workpaper", label: "人工底稿" },
  { value: "voucher", label: "凭证" },
];

export const MATCHED_ENTRY_TYPES = new Set<ConsolidationEntryType>(["intercompanyBalance", "internalTrading", "cashFlow"]);

export interface TaxEffectRow {
  id: number;
  entryId: number;
  entryTitle: string;
  entryStatus: ConsolidationEntrySnapshot["status"];
  effectKey: string;
  differenceAmount: number;
  taxRate: number;
  derivedTaxAmount: number;
  recognition: "asset" | "liability" | "unrecognized";
  entitySnapshotId?: number | null;
  jurisdiction?: string | null;
  recognitionLocation?: "profitOrLoss" | "otherComprehensiveIncome" | "equity" | null;
  balanceSheetLineCode?: string | null;
  counterpartLineCode?: string | null;
  recoverabilityConclusion: string;
  evidence: string;
}

export const TAX_EFFECT_COLUMNS: DataSurfaceColumnSpec<TaxEffectRow>[] = [
  { key: "entry", label: "关联分录", required: true, width: "lg", cell: (row) => row.entryTitle },
  { key: "effectKey", label: "税务影响", required: true, width: "md", cell: (row) => row.effectKey },
  { key: "difference", label: "暂时性差异", width: "md", cell: (row) => ({ kind: "amount", value: row.differenceAmount }) },
  { key: "rate", label: "税率", width: "sm", cell: (row) => `${(row.taxRate * 100).toFixed(2)}%` },
  { key: "tax", label: "派生税额", required: true, width: "md", cell: (row) => ({ kind: "amount", value: row.derivedTaxAmount }) },
  { key: "recognition", label: "确认口径", width: "md", cell: (row) => row.recognition === "asset" ? "递延所得税资产" : row.recognition === "liability" ? "递延所得税负债" : "不确认" },
  { key: "location", label: "入表位置", width: "lg", cell: (row) => row.recognition === "unrecognized" ? "不入表" : `${row.jurisdiction || "—"} · ${row.balanceSheetLineCode || "—"} / ${row.counterpartLineCode || "—"}` },
  { key: "conclusion", label: "判断结论", width: "xl", cell: (row) => row.recoverabilityConclusion },
  { key: "evidence", label: "证据", width: "xl", cell: (row) => row.evidence },
];

const EVENT_ACTION_LABELS: Record<ConsolidationBatchEventSnapshot["action"], string> = {
  create: "创建批次", submit: "提交复核", return: "退回修改", review: "独立复核", lock: "锁定批次", publish: "发布报表",
  "entry.generate": "自动生成抵销草稿", "entry.approve": "通过抵销分录", "entry.return": "退回抵销分录",
  "entry.delete": "删除抵销草稿", "taxEffect.delete": "删除税效草稿",
};

export const EVENT_COLUMNS: DataSurfaceColumnSpec<ConsolidationBatchEventSnapshot>[] = [
  { key: "revision", label: "修订", required: true, width: "xs", cell: (row) => `r${row.batchRevision}` },
  { key: "action", label: "动作", required: true, width: "md", cell: (row) => EVENT_ACTION_LABELS[row.action] },
  { key: "status", label: "状态变化", width: "md", cell: (row) => row.fromStatus === row.toStatus ? row.toStatus : `${row.fromStatus} → ${row.toStatus}` },
  { key: "target", label: "对象", width: "sm", cell: (row) => row.targetType && row.targetId ? `${row.targetType} #${row.targetId}` : "批次" },
  { key: "actor", label: "处理人", width: "sm", cell: (row) => row.actorName },
  { key: "note", label: "退回/变更原因", width: "xl", cell: (row) => row.note || "—" },
  { key: "time", label: "时间", width: "lg", cell: (row) => new Date(row.createdAt).toLocaleString("zh-CN", { hour12: false }) },
];

export function choiceField(
  key: string,
  label: ReactNode,
  value: string,
  options: { value: string; label: string }[],
  onChange: (value: string) => void,
  required = true,
): FormSurfaceFieldSpec {
  return {
    key, label, required,
    spec: { valueType: "string", control: "choice", options: { source: "static", items: options } },
    value,
    onChange: (next) => onChange(String(next ?? "")),
  };
}

export function textField(
  key: string,
  label: string,
  value: string,
  onChange: (value: string) => void,
  input: { required?: boolean; span?: 2 | 3; multiline?: boolean } = {},
): FormSurfaceFieldSpec {
  return {
    key, label, required: input.required, span: input.span,
    spec: { valueType: "string", control: "text", ...(input.multiline ? { multiline: true } : {}) },
    value,
    rows: input.multiline ? 2 : undefined,
    onChange: (next) => onChange(String(next ?? "")),
  };
}
