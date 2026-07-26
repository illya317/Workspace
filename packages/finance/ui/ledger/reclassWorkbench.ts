import { matchText } from "@workspace/core/search";
import type { DataSurfaceColumnSpec } from "@workspace/core/ui";

import type { ReclassBasis, ReclassEntry } from "@workspace/finance/types";
import { formatFinanceAmount } from "../formatters";

export type ReclassWorkbenchFilter = "all" | "pending" | "automatic" | "manual" | "no_process" | "historical";
export type GroupRuleStatusFilter = "all" | "reclassified" | "no_reclass" | "unconfirmed";

export interface ReclassTargetOption {
  value: string;
  label: string;
  searchText?: string;
}

export function reclassBasisLabel(basis: ReclassBasis) {
  return basis === "counterparty_gross" ? "按户逐户" : "科目净额";
}

export function reclassBasisBadge(basis: ReclassBasis) {
  return basis === "counterparty_gross"
    ? { kind: "badge" as const, label: "按户逐户", tone: "blue" as const }
    : { kind: "badge" as const, label: "科目净额", tone: "gray" as const };
}

/** 毛额口径但没有任何辅助余额事实：当前逐户毛额不可得，只允许“无需处理”。 */
export function isGrossRowWithoutFacts(row: ReclassEntry) {
  return row.basis === "counterparty_gross" && row.currentAbnormalAmount === null;
}

export function filterReclassEntries(entries: readonly ReclassEntry[], filter: ReclassWorkbenchFilter, keyword: string) {
  return entries.filter((row) => {
    const inFilter = filter === "all"
      || (filter === "pending" && row.status === "pending")
      || (filter === "automatic" && row.status === "automatic")
      || (filter === "manual" && row.status === "manual")
      || (filter === "no_process" && row.status === "no_process")
      || (filter === "historical" && row.status === "historical");
    if (!inFilter) return false;
    if (!keyword) return true;
    return [row.accountCode, row.accountName, row.targetAccountCode, row.targetAccountName]
      .some((value) => value && matchText(value, keyword));
  });
}

export function createReclassWorkbenchColumns(input: {
  canRevise: boolean;
  editMode: boolean;
  targetOptionsForRow: (row: ReclassEntry) => ReclassTargetOption[];
  targetValue: (row: ReclassEntry) => string;
  onTargetChange: (row: ReclassEntry, value: string) => void;
}): DataSurfaceColumnSpec<ReclassEntry>[] {
  return [
    {
      key: "account",
      label: "科目",
      required: true,
      cell: (row) => ({
        kind: "stack",
        gap: "xs",
        items: [
          { kind: "text", value: row.accountCode, font: "mono", emphasis: "medium" },
          { kind: "text", value: row.accountName },
        ],
      }),
    },
    {
      key: "amount",
      label: "应用 / 候选金额",
      required: true,
      align: "right",
      font: "mono",
      cell: (row) => `¥${formatFinanceAmount(row.amount)}`,
    },
    {
      key: "currentAmount",
      label: "当前反向余额",
      required: true,
      align: "right",
      font: "mono",
      cell: (row) => {
        if (row.currentAbnormalAmount === null) {
          return { kind: "text", value: isGrossRowWithoutFacts(row) ? "无辅助余额事实" : "无余额事实", tone: "muted" };
        }
        if (!row.stale) return `¥${formatFinanceAmount(row.currentAbnormalAmount)}`;
        return {
          kind: "stack",
          gap: "xs",
          items: [
            { kind: "text", value: `¥${formatFinanceAmount(row.currentAbnormalAmount)}`, font: "mono" },
            { kind: "badge", label: "已过期 · 待复核", tone: "orange" },
          ],
        };
      },
    },
    {
      key: "direction",
      label: "余额方向",
      required: true,
      align: "center",
      width: "content",
      cell: (row) => row.currentAbnormalAmount === null
        ? { kind: "badge", label: "无余额事实", tone: "gray" }
        : row.currentAbnormalAmount === 0
          ? { kind: "badge", label: "无反向余额", tone: "gray" }
          : { kind: "badge", label: row.balanceSide === "debit" ? "借" : "贷", tone: "red" },
    },
    {
      key: "classification",
      label: "判断口径",
      required: true,
      align: "center",
      cell: (row) => classificationBadge(row),
    },
    {
      key: "basis",
      label: "计算口径",
      required: true,
      align: "center",
      width: "content",
      cell: (row) => reclassBasisBadge(row.basis),
    },
    {
      key: "target",
      label: "目标科目 / 规则",
      required: true,
      width: "lg",
      cell: (row) => {
        if (input.editMode && isRuleEditable(row, input.canRevise)) {
          return {
            kind: "input",
            spec: {
              valueType: "string",
              control: "choice",
              options: { source: "static", items: input.targetOptionsForRow(row), visibleCount: 8 },
            },
            value: input.targetValue(row),
            onChange: (value) => input.onTargetChange(row, String(value ?? "")),
            placeholder: "输入科目编码或名称",
            emptyText: "无匹配科目",
            density: "compact",
          };
        }
        const label = targetLabel(row);
        if (!isRuleEditable(row, input.canRevise)) return label ? { kind: "text", value: label } : { kind: "empty" };
        return {
          kind: "selectionGrid",
          options: [{ value: row.id, label: label || "选择目标科目" }],
          mode: "readOnly",
          presentation: "card",
          columns: 1,
          layout: "fixed",
          truncate: true,
          ariaLabel: `配置科目 ${row.accountCode} 的目标科目`,
        };
      },
    },
    {
      key: "status",
      label: "处理状态",
      required: true,
      align: "center",
      cell: (row) => statusBadge(row),
    },
  ];
}

function isRuleEditable(row: ReclassEntry, canRevise: boolean) {
  return canRevise
    && row.sourceType !== "legacy_voucher"
    && (row.classification === "reclass_candidate" || row.classification === "pending_review")
    && row.status !== "historical"
    && (row.stale || (row.currentAbnormalAmount !== null && row.currentAbnormalAmount > 0));
}

function classificationBadge(row: ReclassEntry) {
  const specs = {
    reclass_candidate: { label: "重分类候选", tone: "green" as const },
    pending_review: { label: "待财务确认", tone: "orange" as const },
    allowed_negative: { label: "允许负数", tone: "blue" as const },
    contra_account: { label: "抵减科目", tone: "gray" as const },
    non_balance_sheet_negative: { label: "非资产负债表", tone: "gray" as const },
    legacy_voucher_adjustment: { label: "历史凭证调整", tone: "orange" as const },
  };
  return { kind: "badge" as const, ...specs[row.classification] };
}

function statusBadge(row: ReclassEntry) {
  const historicalLabel = row.historicalMethod === "manual" ? "历史 · 人工"
    : row.historicalMethod === "no_process" ? "历史 · 无需处理"
      : row.historicalMethod === "automatic" ? "历史 · 自动"
        : "历史记录";
  const specs = {
    pending: { label: row.ruleId ? "待生成" : "未配置", tone: "orange" as const },
    automatic: { label: "自动分类", tone: "green" as const },
    manual: { label: "人工分类", tone: "blue" as const },
    no_process: { label: "无需处理", tone: "gray" as const },
    historical: { label: historicalLabel, tone: "gray" as const },
  };
  return { kind: "badge" as const, ...specs[row.status] };
}

function targetLabel(row: ReclassEntry) {
  if (row.decision === "no_reclass") return "无需处理";
  if (!row.targetAccountCode) return "";
  return row.targetAccountName ? `${row.targetAccountCode} ${row.targetAccountName}` : row.targetAccountCode;
}
