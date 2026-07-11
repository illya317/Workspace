import type { ReactNode } from "react";
import {
  createInlineFieldsSection,
  createPageTableSection,
  type BodySurfaceSectionSpec,
  type DataSurfaceCellSpec,
  type DataSurfaceColumnSpec,
} from "@workspace/core/ui";
import type { DeptBudgetItem, RdBudgetItem } from "../types";

const MONTH_LABELS = Array.from({ length: 12 }, (_, index) => `${index + 1}月`);

type MonthlyBudgetItem = {
  months: number[];
  total: number;
};

type BudgetTableRow<T extends MonthlyBudgetItem> =
  | { kind: "item"; id: string; item: T }
  | { kind: "total"; id: "total"; months: number[]; total: number };

type BudgetFilterField = {
  key: string;
  label: string;
  summaryLabel: string;
  value: string;
  options: string[];
  placeholder: string;
  onChange: (value: string) => void;
};

type BudgetViewSummary<T extends MonthlyBudgetItem> = {
  items: T[];
  monthTotals: number[];
  total: number;
};

type DeptBudgetSectionsInput = BudgetViewSummary<DeptBudgetItem> & {
  values: { dept: string; type: string; account: string };
  options: { dept: string[]; type: string[]; account: string[] };
  setValue: (key: "dept" | "type" | "account", value: string) => void;
};

type RdBudgetSectionsInput = BudgetViewSummary<RdBudgetItem> & {
  values: { project: string; category: string };
  options: { project: string[]; category: string[] };
  setValue: (key: "project" | "category", value: string) => void;
};

export function createDeptBudgetSections(input: DeptBudgetSectionsInput): BodySurfaceSectionSpec[] {
  return [
    ...createBudgetFilterSections("dept-budget", [
      createFilterField("dept", "部门", "部门", input.values.dept, input.options.dept, "全部部门", input.setValue),
      createFilterField("type", "费用类型", "类型", input.values.type, input.options.type, "全部类型", input.setValue),
      createFilterField("account", "科目", "科目", input.values.account, input.options.account, "全部科目", input.setValue),
    ], input.items.length, input.total),
    createBudgetTableSection({
      key: "dept-budget",
      ...input,
      rowId: (item, index) => `${item.dept}-${item.account}-${index}`,
      itemColumns: [
        itemColumn<DeptBudgetItem>("dept", "部门", (item) => item.dept, "合计"),
        itemColumn<DeptBudgetItem>("account", "科目", (item) => item.account),
        accountColumn<DeptBudgetItem>(),
        itemColumn<DeptBudgetItem>("expenseType", "费用类型", (item) => ({
          kind: "badge",
          label: item.expenseType,
          tone: expenseTypeTone(item.expenseType),
        })),
      ],
    }),
  ];
}

export function createRdBudgetSections(input: RdBudgetSectionsInput): BodySurfaceSectionSpec[] {
  return [
    ...createBudgetFilterSections("rd-budget", [
      createFilterField("project", "研发项目", "项目", input.values.project, input.options.project, "全部项目", input.setValue),
      createFilterField("category", "产品类别", "类别", input.values.category, input.options.category, "全部类别", input.setValue),
    ], input.items.length, input.total),
    createBudgetTableSection({
      key: "rd-budget",
      ...input,
      rowId: (item, index) => `${item.project}-${item.category}-${index}`,
      itemColumns: [
        itemColumn<RdBudgetItem>("project", "研发项目", (item) => item.project, "合计"),
        itemColumn<RdBudgetItem>("category", "产品类别", (item) => item.category),
        accountColumn<RdBudgetItem>(),
      ],
    }),
  ];
}

function createFilterField<K extends string>(
  key: K,
  label: string,
  summaryLabel: string,
  value: string,
  options: string[],
  placeholder: string,
  setValue: (key: K, value: string) => void,
): BudgetFilterField {
  return { key, label, summaryLabel, value, options, placeholder, onChange: (nextValue) => setValue(key, nextValue) };
}

function createBudgetFilterSections(
  key: string,
  filters: BudgetFilterField[],
  count: number,
  total: number,
): BodySurfaceSectionSpec[] {
  const activeFilters = filters.filter((filter) => filter.value);
  return [
    createInlineFieldsSection(`${key}-filters`, filters.map((filter) => ({
      key: filter.key,
      label: filter.label,
      spec: {
        valueType: "string" as const,
        control: "choice" as const,
        options: {
          source: "static" as const,
          items: filter.options.map((option) => ({ value: option, label: option })),
        },
      },
      value: filter.value,
      onChange: (value: unknown) => filter.onChange(String(value ?? "")),
      placeholder: filter.placeholder,
    })), {
      kind: "filters",
      commands: activeFilters.length > 0 ? [{
        key: "reset",
        label: "重置筛选",
        icon: "reset",
        onClick: () => filters.forEach((filter) => filter.onChange("")),
      }] : undefined,
    }),
    {
      key: `${key}-filter-summary`,
      body: {
        kind: "section",
        message: {
          tone: "muted",
          content: `共 ${count} 条，合计 ${formatAmount(total)} 万元${activeFilters.length > 0
            ? `；当前筛选：${activeFilters.map((filter) => `${filter.summaryLabel}：${filter.value}`).join("、")}`
            : ""}`,
        },
      },
    },
  ];
}

function createBudgetTableSection<T extends MonthlyBudgetItem>({
  key,
  items,
  monthTotals,
  total,
  rowId,
  itemColumns,
}: BudgetViewSummary<T> & {
  key: string;
  rowId: (item: T, index: number) => string;
  itemColumns: DataSurfaceColumnSpec<BudgetTableRow<T>>[];
}): BodySurfaceSectionSpec {
  const rows: BudgetTableRow<T>[] = [
    ...items.map((item, index) => ({ kind: "item" as const, id: rowId(item, index), item })),
    { kind: "total", id: "total", months: monthTotals, total },
  ];
  const columns = [
    ...itemColumns,
    ...createMonthColumns<T>(),
    createTotalColumn<T>(),
  ];

  return createPageTableSection(key, {
    rows,
    columns,
    visibleColumns: columns.map((column) => column.key),
    emptyText: "暂无数据",
    rowKey: (row) => row.id,
    rowState: (row) => row.kind === "total" ? "total" : "normal",
  });
}

function itemColumn<T extends MonthlyBudgetItem>(
  key: string,
  label: string,
  cell: (item: T) => ReactNode | DataSurfaceCellSpec,
  totalLabel: string | null = null,
): DataSurfaceColumnSpec<BudgetTableRow<T>> {
  return {
    key,
    label,
    required: true,
    cell: (row) => row.kind === "total" ? totalLabel : cell(row.item),
  };
}

function accountColumn<T extends MonthlyBudgetItem & {
  accountCode: string | null;
  accountActive: boolean | null;
}>(): DataSurfaceColumnSpec<BudgetTableRow<T>> {
  return itemColumn("accountCode", "关联科目", (item) => {
    if (!item.accountCode) return { kind: "text", value: "未关联", tone: "danger" };
    return {
      kind: "text",
      value: `${item.accountCode}${item.accountActive ? "" : " (未启用)"}`,
      font: "mono",
      tone: item.accountActive ? "success" : "muted",
    };
  });
}

function createMonthColumns<T extends MonthlyBudgetItem>(): DataSurfaceColumnSpec<BudgetTableRow<T>>[] {
  return MONTH_LABELS.map((label, monthIndex) => ({
    key: `m${monthIndex}`,
    label,
    required: true,
    align: "right",
    cell: (row) => {
      const value = row.kind === "total" ? row.months[monthIndex] ?? 0 : row.item.months[monthIndex] ?? 0;
      return row.kind === "total" || value > 0 ? formatAmount(value) : "";
    },
  }));
}

function createTotalColumn<T extends MonthlyBudgetItem>(): DataSurfaceColumnSpec<BudgetTableRow<T>> {
  return {
    key: "total",
    label: "合计",
    required: true,
    align: "right",
    emphasis: "medium",
    cell: (row) => formatAmount(row.kind === "total" ? row.total : row.item.total),
  };
}

function expenseTypeTone(expenseType: string) {
  if (expenseType === "管理费用") return "blue" as const;
  if (expenseType === "销售费用") return "orange" as const;
  if (expenseType === "研发费用") return "sky" as const;
  return "gray" as const;
}

function formatAmount(value: number) {
  return value.toFixed(2);
}
