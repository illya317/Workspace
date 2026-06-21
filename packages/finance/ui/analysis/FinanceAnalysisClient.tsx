"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useState } from "react";
import { EmptyStateCard, MetricCard, SectionCard } from "@workspace/core/ui";
import { AnalysisPageFrame } from "@workspace/core/ui";
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
    <AnalysisPageFrame
      metrics={(
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <MetricCard label="营业收入" value="-" />
          <MetricCard label="毛利率" value="-" />
          <MetricCard label="净利率" value="-" />
        </div>
      )}
    >
      <SectionCard title="预算概览">
        {budget?.hasBudget ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <p className="text-xs text-gray-400">生效版本</p>
              <p className="mt-1 text-sm font-medium text-gray-700">{budget.version?.name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">部门预算总额</p>
              <p className="mt-1 text-lg font-bold text-emerald-600">
                {(budget.deptTotal ?? 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">研发预算总额</p>
              <p className="mt-1 text-lg font-bold text-blue-600">
                {(budget.rdTotal ?? 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">暂无生效预算版本</p>
        )}
      </SectionCard>

      <EmptyStateCard>财务分析看板开发中</EmptyStateCard>
    </AnalysisPageFrame>
  );
}
