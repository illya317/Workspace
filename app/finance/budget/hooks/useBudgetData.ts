"use client";

import { useEffect, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import { DeptBudgetItem, RdBudgetItem } from "../BudgetTab";

interface BudgetData {
  deptBudget: DeptBudgetItem[];
  rdBudget: RdBudgetItem[];
  versionId: number | null;
}

interface Version {
  id: number;
  name: string;
  status: string;
  createdAt: string;
}

export function useBudgetData(year: number, companyCode?: string) {
  const [data, setData] = useState<BudgetData | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 加载版本列表
  useEffect(() => {
    fetch(`/workspace/api/finance/budget/versions?year=${year}${companyCode ? `&companyCode=${companyCode}` : ""}`)
      .then((r) => r.json())
      .then((d: { versions: Version[] }) => {
        setVersions(d.versions);
        const active = d.versions.find((v) => v.status === "active");
        if (active) setActiveVersionId(active.id);
      })
      .catch(() => setError("加载版本列表失败"));
  }, [year, companyCode]);

  // 加载预算数据（按 activeVersionId 或默认）
  useEffect(() => {
    setLoading(true);
    const url = activeVersionId
      ? workspacePath(`/api/finance/budget?year=${year}&versionId=${activeVersionId}`)
      : workspacePath(`/api/finance/budget?year=${year}${companyCode ? `&companyCode=${companyCode}` : ""}`);

    fetch(url)
      .then((r) => r.json())
      .then((d: BudgetData) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setError("加载预算数据失败");
        setLoading(false);
      });
  }, [year, companyCode, activeVersionId]);

  return { data, versions, activeVersionId, setActiveVersionId, loading, error };
}
