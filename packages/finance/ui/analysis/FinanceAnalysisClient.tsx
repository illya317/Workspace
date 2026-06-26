"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useState } from "react";
import { DataSurface } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";

interface BudgetOverview {
  hasBudget: boolean;
  version?: { name: string; status: string };
  deptTotal?: number;
  rdTotal?: number;
}

interface Props {
  user: SessionUser;
}

export default function FinanceAnalysisClient({ user: _user }: Props) {
  const [budget, setBudget] = useState<BudgetOverview | null>(null);

  useEffect(() => {
    fetch(workspacePath("/api/modules/finance/analysis/budget?year=2026"))
      .then((response) => response.json())
      .then(setBudget)
      .catch(() => setBudget({ hasBudget: false }));
  }, []);

  return (
    <div className="space-y-4">
      <DataSurface kind="metrics" metrics={[
        { key: "revenue", label: "营业收入", value: "-" },
        { key: "gross-margin", label: "毛利率", value: "-" },
        { key: "net-margin", label: "净利率", value: "-" },
      ]} />
      {budget?.hasBudget ? (
        <DataSurface
          kind="metrics"
          framed
          title="预算概览"
          metrics={[
            { key: "version", label: "生效版本", value: budget.version?.name ?? "—" },
            { key: "dept-total", label: "部门预算总额", value: (budget.deptTotal ?? 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 }) },
            { key: "rd-total", label: "研发预算总额", value: (budget.rdTotal ?? 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 }) },
          ]}
        />
      ) : (
        <DataSurface kind="records" framed title="预算概览" records={[]} empty="暂无生效预算版本" />
      )}

      <DataSurface kind="records" records={[]} empty="财务分析看板开发中" />
    </div>
  );
}
