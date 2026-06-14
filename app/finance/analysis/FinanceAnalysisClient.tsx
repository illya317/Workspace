"use client";

import { useEffect, useState } from "react";
import { SessionUser } from "@/lib/types";

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
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-2 text-2xl font-bold text-gray-800">财务分析</h1>
      <p className="mb-6 text-sm text-gray-500">财务数据分析与指标看板</p>

      {/* 预算概览卡片 */}
      <div className="mb-6 rounded-lg bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-base font-semibold text-gray-800">预算概览</h2>
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
      </div>

      {/* 原有占位内容保留 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-gray-600">营业收入</h3>
          <p className="mt-2 text-2xl font-bold text-gray-800">-</p>
          <p className="text-xs text-gray-400">待接入数据</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-gray-600">毛利率</h3>
          <p className="mt-2 text-2xl font-bold text-gray-800">-</p>
          <p className="text-xs text-gray-400">待接入数据</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-gray-600">净利率</h3>
          <p className="mt-2 text-2xl font-bold text-gray-800">-</p>
          <p className="text-xs text-gray-400">待接入数据</p>
        </div>
      </div>

      <div className="mt-6 rounded-lg bg-white p-8 text-center shadow-sm">
        <p className="text-sm text-gray-400">财务分析看板开发中</p>
      </div>
    </main>
  );
}
