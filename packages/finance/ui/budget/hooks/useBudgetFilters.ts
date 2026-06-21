"use client";

import { useMemo, useState } from "react";
import type { DeptBudgetItem, RdBudgetItem } from "../types";

export function useBudgetFilters(data: { deptBudget: DeptBudgetItem[]; rdBudget: RdBudgetItem[] } | null) {
  // Dept filters
  const [deptFilter, setDeptFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");

  // R&D filters
  const [projectFilter, setProjectFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const deptOptions = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.deptBudget.map((i) => i.dept))].sort();
  }, [data]);

  const typeOptions = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.deptBudget.map((i) => i.expenseType).filter(Boolean))].sort();
  }, [data]);

  const accountOptions = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.deptBudget.map((i) => i.account))].sort();
  }, [data]);

  const projectOptions = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.rdBudget.map((i) => i.project))].sort();
  }, [data]);

  const categoryOptions = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.rdBudget.map((i) => i.category))].sort();
  }, [data]);

  const filteredDept = useMemo(() => {
    if (!data) return [];
    return data.deptBudget.filter((i) => {
      if (deptFilter && i.dept !== deptFilter) return false;
      if (typeFilter && i.expenseType !== typeFilter) return false;
      if (accountFilter && i.account !== accountFilter) return false;
      return true;
    });
  }, [data, deptFilter, typeFilter, accountFilter]);

  const filteredRd = useMemo(() => {
    if (!data) return [];
    return data.rdBudget.filter((i) => {
      if (projectFilter && i.project !== projectFilter) return false;
      if (categoryFilter && i.category !== categoryFilter) return false;
      return true;
    });
  }, [data, projectFilter, categoryFilter]);

  const deptTotal = useMemo(() => filteredDept.reduce((s, i) => s + i.total, 0), [filteredDept]);
  const rdTotal = useMemo(() => filteredRd.reduce((s, i) => s + i.total, 0), [filteredRd]);

  const deptMonthTotals = useMemo(() => {
    const totals = new Array(12).fill(0);
    for (const i of filteredDept) {
      for (let m = 0; m < 12; m++) totals[m] += i.months[m];
    }
    return totals;
  }, [filteredDept]);

  const rdMonthTotals = useMemo(() => {
    const totals = new Array(12).fill(0);
    for (const i of filteredRd) {
      for (let m = 0; m < 12; m++) totals[m] += i.months[m];
    }
    return totals;
  }, [filteredRd]);

  return {
    deptFilter, setDeptFilter,
    typeFilter, setTypeFilter,
    accountFilter, setAccountFilter,
    projectFilter, setProjectFilter,
    categoryFilter, setCategoryFilter,
    deptOptions, typeOptions, accountOptions,
    projectOptions, categoryOptions,
    filteredDept, filteredRd,
    deptTotal, rdTotal,
    deptMonthTotals, rdMonthTotals,
  };
}
