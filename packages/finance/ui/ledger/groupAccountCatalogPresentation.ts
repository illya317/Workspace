import {
  createPageTableSection,
  createStatusSection,
} from "@workspace/core/ui";
import type {
  BodySurfaceSectionSpec,
  DataSurfaceColumnSpec,
  FormSurfaceFieldSpec,
  SelectorSurfaceStructuredTreeItemSpec,
} from "@workspace/core/ui";
import type {
  FinanceGroupAccountCatalogResponse,
  FinanceGroupAccountCatalogRow,
  FinanceGroupAccountMappedLocalAccountRow,
} from "@workspace/finance/types";

import { balanceDirectionLabel, categoryLabel } from "./groupAccountMappingPresentation";
import { formatFinanceDateTime } from "../formatters";

const MAPPED_ACCOUNT_COLUMNS: DataSurfaceColumnSpec<FinanceGroupAccountMappedLocalAccountRow>[] = [
  {
    key: "company",
    label: "公司",
    required: true,
    cell: (row) => ({ kind: "stack", gap: "xs", items: [
      { kind: "text", value: row.companyName, emphasis: "medium" },
      { kind: "text", value: row.companyCode, tone: "muted", font: "mono" },
    ] }),
  },
  {
    key: "localAccount",
    label: "公司科目",
    required: true,
    cell: (row) => ({ kind: "stack", gap: "xs", items: [
      { kind: "text", value: row.localAccountCode, font: "mono" },
      { kind: "text", value: row.localAccountName, tone: "muted" },
    ] }),
  },
  {
    key: "attributes",
    label: "属性",
    required: true,
    cell: (row) => ({
      kind: "text",
      value: `${categoryLabel(row.localCategory)} · ${balanceDirectionLabel(row.localBalanceDirection)}`,
      tone: "muted",
    }),
  },
  {
    key: "years",
    label: "适用年度",
    required: true,
    cell: (row) => ({ kind: "text", value: mappedYearsLabel(row), tone: "muted" }),
  },
  {
    key: "source",
    label: "来源账套",
    required: true,
    cell: (row) => ({ kind: "text", value: sourceScopeLabel(row), tone: "muted" }),
  },
];

export function mappedAccountSections(
  selected: FinanceGroupAccountCatalogRow,
  rows: FinanceGroupAccountMappedLocalAccountRow[] | undefined,
  state: "loading" | "error" | undefined,
): BodySurfaceSectionSpec[] {
  if (state === "loading") {
    return [createStatusSection("mapped-account-loading", { kind: "loading", content: "加载已确认/已复核公司科目..." })];
  }
  if (state === "error") {
    return [createStatusSection("mapped-account-error", { kind: "error", content: "已确认/已复核公司科目加载失败" })];
  }
  if (!rows?.length) {
    return [createStatusSection("mapped-account-empty", { kind: "empty", content: "暂无已确认/已复核公司科目" })];
  }
  return [createPageTableSection<FinanceGroupAccountMappedLocalAccountRow>(`mapped-account-${selected.id}`, {
    rows,
    columns: MAPPED_ACCOUNT_COLUMNS,
    visibleColumns: MAPPED_ACCOUNT_COLUMNS.map((column) => column.key),
    rowKey: (row) => row.mappingId,
    presentation: { density: "compact", cellWrap: "wrap" },
  })];
}

export function groupAccountDetailFields(
  row: FinanceGroupAccountCatalogRow,
  businessTimeZone: string,
): FormSurfaceFieldSpec[] {
  return [
    readOnlyDetail("category", "科目类别", categoryLabel(row.category)),
    readOnlyDetail("balanceDirection", "余额方向", balanceDirectionLabel(row.balanceDirection)),
    readOnlyDetail("reviewStatus", "复核状态", groupReviewStatusLabel(row.reviewStatus)),
    ...(row.reviewedAt ? [
      readOnlyDetail("reviewedBy", "复核人", row.reviewedBy === null ? "—" : String(row.reviewedBy)),
      readOnlyDetail("reviewedAt", "复核时间", formatFinanceDateTime(row.reviewedAt, businessTimeZone)),
    ] : []),
    readOnlyDetail("status", "状态", row.isActive ? "启用" : "停用"),
    readOnlyDetail("parent", groupAccountParentLabel(row), groupAccountParentValue(row)),
    readOnlyDetail("years", "科目年份", yearsLabel(row.years)),
    readOnlyDetail("mappingCount", "已确认/已复核公司科目", `${row.mappingCount} 个`),
  ];
}

export function groupAccountParentDescription(row: FinanceGroupAccountCatalogRow) {
  if (row.parent) return `父级 ${row.parent.code} ${row.parent.name}`;
  const recommendation = row.parentRecommendation;
  if (recommendation?.kind === "mapped") {
    return `建议归入 ${recommendation.groupAccount.code} ${recommendation.groupAccount.name}`;
  }
  if (recommendation?.kind === "unresolved") {
    return `来源父级 ${recommendation.localParent.code} ${recommendation.localParent.name} 尚未匹配`;
  }
  return "一级科目";
}

export function buildGroupAccountTree(
  rows: FinanceGroupAccountCatalogRow[],
): SelectorSurfaceStructuredTreeItemSpec<FinanceGroupAccountCatalogRow>[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const childrenByParent = new Map<number, FinanceGroupAccountCatalogRow[]>();
  const roots: FinanceGroupAccountCatalogRow[] = [];
  for (const row of rows) {
    const parentId = effectiveParentId(row);
    if (parentId !== null && parentId !== row.id && byId.has(parentId)) {
      const children = childrenByParent.get(parentId) ?? [];
      children.push(row);
      childrenByParent.set(parentId, children);
    } else {
      roots.push(row);
    }
  }
  const visited = new Set<number>();
  const declare = (
    row: FinanceGroupAccountCatalogRow,
    branch: Set<number>,
  ): SelectorSurfaceStructuredTreeItemSpec<FinanceGroupAccountCatalogRow> => {
    visited.add(row.id);
    const nextBranch = new Set(branch).add(row.id);
    const children = (childrenByParent.get(row.id) ?? [])
      .filter((child) => !nextBranch.has(child.id))
      .map((child) => declare(child, nextBranch));
    return {
      key: row.id,
      value: row,
      card: { title: `${row.code} ${row.name}`, showLevelBadge: false },
      children: children.length ? children : undefined,
    };
  };
  const items = roots.map((row) => declare(row, new Set()));
  for (const row of rows) {
    if (!visited.has(row.id)) items.push(declare(row, new Set()));
  }
  return items;
}

export function initialExpandedTreeIds(
  response: FinanceGroupAccountCatalogResponse,
  focusMatches: boolean,
) {
  const byId = new Map(response.treeRows.map((row) => [row.id, row]));
  const expanded = new Set<number>();
  if (!focusMatches) {
    for (const row of response.treeRows) {
      const parentId = effectiveParentId(row);
      if (parentId === null || !byId.has(parentId)) expanded.add(row.id);
    }
    return expanded;
  }
  for (const row of response.rows) {
    let parentId = effectiveParentId(row);
    const branch = new Set<number>();
    while (parentId !== null && !branch.has(parentId)) {
      expanded.add(parentId);
      branch.add(parentId);
      const parent = byId.get(parentId);
      parentId = parent ? effectiveParentId(parent) : null;
    }
  }
  return expanded;
}

function readOnlyDetail(key: string, label: string, value: string): FormSurfaceFieldSpec {
  return {
    key,
    label,
    spec: { valueType: "string", control: "text" },
    value,
    readOnly: true,
  };
}

function groupAccountParentLabel(row: FinanceGroupAccountCatalogRow) {
  if (row.parent) return "父级科目";
  return row.parentRecommendation?.kind === "mapped" ? "建议父级科目" : "层级判断";
}

function groupAccountParentValue(row: FinanceGroupAccountCatalogRow) {
  if (row.parent) return `${row.parent.code} ${row.parent.name}`;
  const recommendation = row.parentRecommendation;
  if (recommendation?.kind === "mapped") {
    return `${recommendation.groupAccount.code} ${recommendation.groupAccount.name}`;
  }
  if (recommendation?.kind === "unresolved") {
    return `${recommendation.localParent.code} ${recommendation.localParent.name}（父级待匹配）`;
  }
  return "一级科目";
}

function effectiveParentId(row: FinanceGroupAccountCatalogRow) {
  if (row.parent) return row.parent.id;
  return row.parentRecommendation?.kind === "mapped"
    ? row.parentRecommendation.groupAccount.id
    : null;
}

function mappedYearsLabel(row: FinanceGroupAccountMappedLocalAccountRow) {
  if (row.years.length === 0) return row.latestYear ? String(row.latestYear) : "未标年度";
  if (row.years.length === 1) return String(row.years[0]);
  const consecutive = row.years.every((year, index) => index === 0 || year === row.years[index - 1]! + 1);
  return consecutive ? `${row.years[0]}–${row.years.at(-1)}` : row.years.join("、");
}

function sourceScopeLabel(row: FinanceGroupAccountMappedLocalAccountRow) {
  const system = row.sourceSystem === "TPLUS" ? "T+" : row.sourceSystem;
  const ledger = row.sourceLedger ?? row.sourceDatabase;
  return [system, ledger ? shortLedgerName(ledger) : null].filter(Boolean).join(" · ") || "Workspace";
}

function shortLedgerName(value: string) {
  const segments = value.split("_");
  let tail = segments.at(-1)!;
  if (/^(19|20)\d{2}$/.test(tail) && segments.length > 1) {
    tail = segments.at(-2)!;
  }
  if (!/^\d+$/.test(tail)) return value;
  const ledgerNo = Number.parseInt(tail, 10);
  return ledgerNo < 1000 ? String(ledgerNo).padStart(3, "0") : value;
}

function groupReviewStatusLabel(value: FinanceGroupAccountCatalogRow["reviewStatus"]) {
  return ({ confirmed: "已确认", reviewed: "已复核", pending_review: "待复核", pending_delete: "待删除" } as const)[value];
}

function yearsLabel(years: number[]) {
  if (years.length === 0) return "—";
  if (years.length === 1) return String(years[0]);
  const consecutive = years.every((year, index) => index === 0 || year === years[index - 1]! + 1);
  return consecutive ? `${years[0]}–${years.at(-1)}` : years.join("、");
}
