"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import UserMenu from "@/app/components/UserMenu";
import { SessionUser } from "@/lib/types";

export default function FinanceAnalysisClient({ user }: { user: SessionUser }) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Image
              src="/company/logo.png"
              alt={process.env.NEXT_PUBLIC_COMPANY_NAME || "公司"}
              width={100}
              height={30}
              className="h-auto w-auto max-w-[100px] object-contain"
            />
            <span className="text-sm text-gray-400">|</span>
            <span className="text-sm font-medium text-gray-700">财务管理</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/finance/analysis")}
              className="text-sm font-medium text-emerald-600"
            >
              财务分析
            </button>
            <button
              onClick={() => router.push("/finance/cost")}
              className="text-sm text-gray-500 hover:text-emerald-600"
            >
              成本管理
            </button>
            <button
              onClick={() => router.push("/finance")}
              className="text-sm text-gray-500 hover:text-emerald-600"
            >
              总账
            </button>
            <button
              onClick={() => router.push("/portal")}
              className="text-sm text-gray-500 hover:text-emerald-600"
            >
              返回入口
            </button>
            <UserMenu user={user} />
          </div>
        </div>
      </nav>

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
    </div>
  );
}
