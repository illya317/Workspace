"use client";

import { useMemo, useState } from "react";
import type { DeptBudgetItem, RdBudgetItem } from "../types";

type DeptFilterValues = { dept: string; type: string; account: string };
type RdFilterValues = { project: string; category: string };

const EMPTY_DEPT_FILTERS: DeptFilterValues = { dept: "", type: "", account: "" };
const EMPTY_RD_FILTERS: RdFilterValues = { project: "", category: "" };

export function useBudgetFilters(data: { deptBudget: DeptBudgetItem[]; rdBudget: RdBudgetItem[] } | null) {
  const [deptValues, setDeptValues] = useState(EMPTY_DEPT_FILTERS);
  const [rdValues, setRdValues] = useState(EMPTY_RD_FILTERS);

  const deptOptions = useMemo(() => ({
    dept: uniqueOptions(data?.deptBudget ?? [], (item) => item.dept),
    type: uniqueOptions(data?.deptBudget ?? [], (item) => item.expenseType),
    account: uniqueOptions(data?.deptBudget ?? [], (item) => item.account),
  }), [data]);

  const rdOptions = useMemo(() => ({
    project: uniqueOptions(data?.rdBudget ?? [], (item) => item.project),
    category: uniqueOptions(data?.rdBudget ?? [], (item) => item.category),
  }), [data]);

  const deptSummary = useMemo(() => summarizeBudgetItems(filterBudgetItems(data?.deptBudget ?? [], [
    { value: deptValues.dept, read: (item) => item.dept },
    { value: deptValues.type, read: (item) => item.expenseType },
    { value: deptValues.account, read: (item) => item.account },
  ])), [data, deptValues]);

  const rdSummary = useMemo(() => summarizeBudgetItems(filterBudgetItems(data?.rdBudget ?? [], [
    { value: rdValues.project, read: (item) => item.project },
    { value: rdValues.category, read: (item) => item.category },
  ])), [data, rdValues]);

  return {
    dept: {
      values: deptValues,
      options: deptOptions,
      setValue: (key: keyof DeptFilterValues, value: string) => setDeptValues((current) => ({ ...current, [key]: value })),
      ...deptSummary,
    },
    rd: {
      values: rdValues,
      options: rdOptions,
      setValue: (key: keyof RdFilterValues, value: string) => setRdValues((current) => ({ ...current, [key]: value })),
      ...rdSummary,
    },
  };
}

function uniqueOptions<T>(items: T[], read: (item: T) => string) {
  return [...new Set(items.map(read).filter(Boolean))].sort();
}

function filterBudgetItems<T>(items: T[], filters: { value: string; read: (item: T) => string }[]) {
  return items.filter((item) => filters.every((filter) => !filter.value || filter.read(item) === filter.value));
}

function summarizeBudgetItems<T extends { months: number[]; total: number }>(items: T[]) {
  const monthTotals = Array.from({ length: 12 }, () => 0);
  let total = 0;
  for (const item of items) {
    total += item.total;
    for (let month = 0; month < monthTotals.length; month += 1) {
      monthTotals[month] += item.months[month] ?? 0;
    }
  }
  return { items, monthTotals, total };
}
