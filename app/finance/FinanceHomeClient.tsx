"use client";

import { useRouter } from "next/navigation";
import { SessionUser } from "@/lib/types";

const modules = [
  { key: "ledger", title: "总账基础", desc: "科目设置、凭证明细、余额表、期间管理", href: "/finance/ledger" },
  { key: "statements", title: "财务报表", desc: "资产负债表、利润表、现金流量表", href: "/finance/statements" },
  { key: "budget", title: "预算管理", desc: "部门费用预算、研发费用预算", href: "/finance/budget" },
  { key: "analysis", title: "财务分析", desc: "预算执行分析、差异分析、趋势看板", href: "/finance/analysis" },
];

interface Props {
  user: SessionUser;
}

export default function FinanceHomeClient({ user: _user }: Props) {
  const router = useRouter();

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-2 text-2xl font-bold text-gray-800">财务管理</h1>
      <p className="mb-6 text-sm text-gray-500">总账 · 报表 · 预算 · 分析</p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => (
          <div
            key={m.key}
            onClick={() => router.push(m.href)}
            className="cursor-pointer rounded-lg bg-white p-5 shadow-sm transition hover:shadow-md"
          >
            <h3 className="text-base font-semibold text-gray-800">{m.title}</h3>
            <p className="mt-1 text-sm text-gray-500">{m.desc}</p>
            <span className="mt-3 inline-block text-sm text-emerald-600">进入 →</span>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-700">状态概览</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "最近导入批次", status: "待接入" },
            { label: "当前期间状态", status: "待接入" },
            { label: "年度余额基准", status: "待接入" },
            { label: "预算导入状态", status: "待接入" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-white p-4 shadow-sm">
              <p className="text-xs text-gray-400">{s.label}</p>
              <p className="mt-1 text-sm text-gray-400">{s.status}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
