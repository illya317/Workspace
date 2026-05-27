"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import UserMenu from "@/app/components/UserMenu";
import { SessionUser } from "@/lib/types";

export default function FinanceCostClient({ user }: { user: SessionUser }) {
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
              className="text-sm text-gray-500 hover:text-emerald-600"
            >
              财务分析
            </button>
            <button
              onClick={() => router.push("/finance/cost")}
              className="text-sm font-medium text-emerald-600"
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
        <h1 className="mb-2 text-2xl font-bold text-gray-800">成本管理</h1>
        <p className="mb-6 text-sm text-gray-500">生产成本归集与成本核算</p>

        <div className="rounded-lg bg-white p-8 text-center shadow-sm">
          <div className="mb-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <h2 className="text-lg font-semibold text-gray-700">即将上线</h2>
          <p className="mt-2 text-sm text-gray-500">
            成本管理模块正在开发中，可对接现有生产成本数据
          </p>
        </div>
      </main>
    </div>
  );
}
