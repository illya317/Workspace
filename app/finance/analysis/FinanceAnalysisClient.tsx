"use client";

import { useEffect, useState } from "react";
import { SessionUser } from "@workspace/platform/types";
import { EmptyStateCard, MetricCard, PageContent, SectionCard } from "@workspace/core/ui";

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
    fetch("/workspace/api/finance/analysis/budget?year=2026")
      .then((r) => r.json())
      .then(setBudget)
      .catch(() => setBudget({ hasBudget: false }));
  }, []);

  return (
    <PageContent className="max-w-5xl space-y-6">
      {/* 预算概览卡片 */}
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

      {/* 原有占位内容保留 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard label="营业收入" value="-" />
        <MetricCard label="毛利率" value="-" />
        <MetricCard label="净利率" value="-" />
      </div>

      <EmptyStateCard>财务分析看板开发中</EmptyStateCard>
    </PageContent>
  );
}
