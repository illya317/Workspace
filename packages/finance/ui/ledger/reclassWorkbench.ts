import { matchText } from "@workspace/core/search";
import type { DataSurfaceColumnSpec } from "@workspace/core/ui";

import type { ReclassEntry, RuleCandidate } from "@workspace/finance/types";
import { formatFinanceAmount } from "../formatters";

export type ReclassWorkbenchFilter = "attention" | "processed" | "exempt" | "historical" | "all";
export type GroupRuleStatusFilter = "all" | "reclassified" | "no_reclass" | "unconfirmed";

export interface ReclassTargetOption {
  value: string;
  label: string;
  searchText?: string;
}

export function groupRuleKey(row: RuleCandidate) {
  return `${row.accountCode}::${row.abnormalSide}`;
}

export function filterGroupRuleCandidates(rows: readonly RuleCandidate[], keyword: string, status: GroupRuleStatusFilter) {
  return rows.filter((row) => {
    const inStatus = status === "all"
      || (status === "reclassified" && row.effectiveDecision === "reclassify")
      || (status === "no_reclass" && row.effectiveDecision === "no_reclass")
      || (status === "unconfirmed" && row.effectiveDecision === null);
    if (!inStatus) return false;
    if (!keyword) return true;
    return [row.accountCode, row.accountName, row.existingTarget]
      .some((value) => value && matchText(value, keyword));
  });
}

export function createGroupReclassRuleColumns(input: {
  canRevise: boolean;
  editMode: boolean;
  targetOptions: ReclassTargetOption[];
  targetValue: (row: RuleCandidate) => string;
  onTargetChange: (row: RuleCandidate, value: string) => void;
}): DataSurfaceColumnSpec<RuleCandidate>[] {
  const targetLabels = new Map(input.targetOptions.map((option) => [option.value, option.label]));
  return [
    {
      key: "account",
      label: "集团科目",
      required: true,
      width: "lg",
      cell: (row) => ({ kind: "stack", gap: "xs", items: [
        { kind: "text", value: row.accountCode, font: "mono", emphasis: "medium" },
        { kind: "text", value: row.accountName },
        ...(row.existingRuleSourceAccountCode && row.existingRuleSourceAccountCode !== row.accountCode
          ? [{ kind: "text" as const, value: `继承规则 ${row.existingRuleSourceAccountCode}`, tone: "muted" as const }]
          : []),
        ...(!row.hasHistoricalAbnormalBalance && row.existingDecision === null
          ? [{ kind: "text" as const, value: "历史未出现异常方向", tone: "muted" as const }]
          : []),
      ] }),
    },
    {
      key: "naturalSide",
      label: "正常方向",
      required: true,
      align: "center",
      cell: (row) => ({ kind: "badge", label: row.balanceDirection === "credit" ? "贷" : "借", tone: "gray" }),
    },
    {
      key: "abnormalSide",
      label: "异常方向",
      required: true,
      align: "center",
      cell: (row) => ({ kind: "badge", label: row.abnormalSide === "both" ? "双向" : row.abnormalSide === "credit" ? "贷" : "借", tone: "red" }),
    },
    {
      key: "target",
      label: "重分类目标科目",
      required: true,
      width: "lg",
      cell: (row) => {
        if (input.editMode && input.canRevise) {
          return {
            kind: "input",
            spec: {
              valueType: "string",
              control: "choice",
              options: { source: "static", items: input.targetOptions, visibleCount: 8 },
            },
            value: input.targetValue(row),
            onChange: (value) => input.onTargetChange(row, String(value ?? "")),
            placeholder: "选择目标科目或无需重分类",
            emptyText: "无匹配科目",
            density: "compact",
          };
        }
        const target = row.effectiveDecision === "reclassify" ? row.existingTarget : null;
        return target ? targetLabels.get(target) ?? target : { kind: "empty" };
      },
    },
    {
      key: "ruleState",
      label: "规则状态",
      required: true,
      align: "center",
      cell: (row) => row.effectiveDecision === "reclassify"
        ? { kind: "badge", label: "已重分类", tone: "green" }
        : row.effectiveDecision === "no_reclass"
          ? { kind: "badge", label: "无需重分类", tone: "gray" }
          : { kind: "badge", label: "未确认", tone: "orange" },
    },
  ];
}

export function filterReclassEntries(entries: readonly ReclassEntry[], filter: ReclassWorkbenchFilter, keyword: string) {
  return entries.filter((row) => {
    const inFilter = filter === "all"
      || (filter === "attention" && (row.status === "pending"
        || row.status === "configured"
        || (row.stale && (row.status === "approved" || row.status === "adjusted"))))
      || (filter === "processed" && !row.stale && (row.status === "approved" || row.status === "adjusted"))
      || (filter === "exempt" && (row.status === "exempt" || row.status === "rejected"))
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
  targetOptions: ReclassTargetOption[];
  targetValue: (row: ReclassEntry) => string;
  onTargetChange: (row: ReclassEntry, value: string) => void;
}): DataSurfaceColumnSpec<ReclassEntry>[] {
  return [
    {
      key: "account",
      label: "科目",
      required: true,
      width: "sm",
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
          return { kind: "text", value: "无余额事实", tone: "muted" };
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
              options: { source: "static", items: input.targetOptions, visibleCount: 8 },
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
    && row.status !== "exempt"
    && row.status !== "historical"
    && row.currentAbnormalAmount !== null
    && row.currentAbnormalAmount > 0;
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
  const specs = {
    pending: { label: "待确认", tone: "orange" as const },
    configured: { label: "规则已配置", tone: "blue" as const },
    approved: { label: "已重分类", tone: "green" as const },
    adjusted: { label: "已人工调整", tone: "blue" as const },
    rejected: { label: "已排除", tone: "gray" as const },
    exempt: { label: "无需重分类", tone: "gray" as const },
    historical: { label: "历史记录", tone: "gray" as const },
  };
  return { kind: "badge" as const, ...specs[row.status] };
}

function targetLabel(row: ReclassEntry) {
  if (!row.targetAccountCode) return "";
  return row.targetAccountName ? `${row.targetAccountCode} ${row.targetAccountName}` : row.targetAccountCode;
}
