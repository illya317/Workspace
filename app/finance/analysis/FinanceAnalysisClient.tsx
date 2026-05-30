"use client";

import { SessionUser } from "@/lib/types";

interface Props {
  user: SessionUser;
}

export default function FinanceAnalysisClient({ user: _user }: Props) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-2 text-2xl font-bold text-gray-800">财务分析</h1>
      <p className="mb-6 text-sm text-gray-500">财务数据分析与指标看板</p>

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
