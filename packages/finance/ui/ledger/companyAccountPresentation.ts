import type {
  FormSurfaceFieldSpec,
  SelectorSurfaceStructuredTreeItemSpec,
} from "@workspace/core/ui";
import type { FinanceGroupAccountOption } from "@workspace/finance/types";

import type { Account } from "../components/AccountTable";
import { balanceDirectionLabel, categoryLabel } from "./groupAccountMappingPresentation";

export function buildCompanyAccountTree(
  rows: Account[],
): SelectorSurfaceStructuredTreeItemSpec<Account>[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const childrenByParent = new Map<number, Account[]>();
  const roots: Account[] = [];
  for (const row of rows) {
    if (row.parentId !== null && row.parentId !== row.id && byId.has(row.parentId)) {
      const children = childrenByParent.get(row.parentId) ?? [];
      children.push(row);
      childrenByParent.set(row.parentId, children);
    } else {
      roots.push(row);
    }
  }
  const visited = new Set<number>();
  const declare = (
    row: Account,
    branch: Set<number>,
  ): SelectorSurfaceStructuredTreeItemSpec<Account> => {
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

export function initialExpandedCompanyAccountIds(rows: Account[]) {
  const rowIds = new Set(rows.map((row) => row.id));
  return new Set(rows
    .filter((row) => row.parentId === null || !rowIds.has(row.parentId))
    .map((row) => row.id));
}

export function companyAccountDetailFields(input: {
  row: Account;
  groupAccountOptions: FinanceGroupAccountOption[];
  selectedGroupAccountId: string;
  canRevise: boolean;
  onGroupAccountChange: (value: string) => void;
}): FormSurfaceFieldSpec[] {
  const { row } = input;
  const compatibleOptions = input.groupAccountOptions
    .filter((option) => option.category === row.category
      && option.balanceDirection === row.balanceDirection)
    .map((option) => ({
      value: String(option.id),
      label: `${option.code} ${option.name}`,
      description: `${categoryLabel(option.category)} · ${balanceDirectionLabel(option.balanceDirection)}`,
      searchText: `${option.code} ${option.name}`,
    }));
  return [
    readOnlyDetail("category", "科目类别", categoryLabel(row.category)),
    readOnlyDetail("balanceDirection", "余额方向", balanceDirectionLabel(row.balanceDirection)),
    readOnlyDetail("reviewStatus", "复核状态", reviewStatusLabel(row.reviewStatus)),
    readOnlyDetail("status", "状态", row.isActive ? "启用" : "停用"),
    readOnlyDetail("currency", "币种", row.currency || "—"),
    readOnlyDetail("year", "科目年份", row.year ? String(row.year) : "—"),
    readOnlyDetail("parent", "父级科目", row.parent ? `${row.parent.code} ${row.parent.name}` : "一级科目"),
    {
      key: "groupAccountId",
      label: "集团映射",
      required: true,
      spec: {
        valueType: "string",
        control: "choice",
        validation: { required: true },
        options: { source: "static", items: compatibleOptions, visibleCount: 8 },
      },
      value: input.selectedGroupAccountId,
      readOnly: !input.canRevise || !row.mapping || row.reviewStatus === "pending_delete",
      onChange: (value) => input.onGroupAccountChange(String(value ?? "")),
    },
  ];
}

export function companyAccountParentDescription(row: Account) {
  return row.parent ? `父级 ${row.parent.code} ${row.parent.name}` : "一级科目";
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

function reviewStatusLabel(value: Account["reviewStatus"]) {
  return ({
    confirmed: "已确认",
    reviewed: "已复核",
    pending_review: "待复核",
    pending_delete: "待删除",
  } as const)[value];
}
