import { matchText } from "@workspace/core/search";
import type { DataSurfaceColumnSpec } from "@workspace/core/ui";

import type { ReclassBasis, ReclassEntry } from "@workspace/finance/types";
import { formatFinanceAmount } from "../formatters";

export type ReclassWorkbenchFilter = "all" | "pending" | "automatic" | "manual" | "no_process" | "historical";
export type GroupRuleStatusFilter = "all" | "reclassified" | "no_reclass" | "unconfirmed";

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

export function createReclassWorkbenchColumns(): DataSurfaceColumnSpec<ReclassEntry>[] {
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
        const label = targetLabel(row);
        return label ? { kind: "text", value: label } : { kind: "empty" };
      },
    },
  ];
}

function targetLabel(row: ReclassEntry) {
  if (row.decision === "no_reclass") return "无需处理";
  if (!row.targetAccountCode) return "";
  return row.targetAccountName ? `${row.targetAccountCode} ${row.targetAccountName}` : row.targetAccountCode;
}
