"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";
import { SessionUser } from "@/lib/types";

export default function PortalClient({ user }: { user: SessionUser }) {
  const router = useRouter();
  const { toast, showToast, closeToast } = useToast();

  const entries = [
    {
      title: "工作汇报",
      desc: "填写周报、月报、季报、年报",
      icon: (
        <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      color: "emerald",
      onClick: () => router.push("/reports"),
    },
    {
      title: "人事管理",
      desc: "花名册、考勤、工作查看、绩效",
      icon: (
        <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      color: "blue",
      onClick: () => {
        if (user.canAccessHR) {
          router.push("/hr");
        } else {
          showToast("暂无权限，请联系管理员开通", "error");
        }
      },
    },
    {
      title: "行政管理",
      desc: "合同台账、办公事务",
      icon: (
        <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
      color: "indigo",
      onClick: () => router.push("/administration"),
    },
    {
      title: "文档中心",
      desc: "员工手册、操作指南、规章制度",
      icon: (
        <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
      color: "purple",
      onClick: () => router.push("/docs"),
    },
    {
      title: "财务数据",
      desc: "总账、凭证、财务报表",
      icon: (
        <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
          <text x="12" y="16.5" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" stroke="none">¥</text>
        </svg>
      ),
      color: "amber",
      onClick: () => {
        if (user.canAccessFinance) {
          router.push("/finance");
        } else {
          showToast("暂无权限，请联系管理员开通", "error");
        }
      },
    },
    {
      title: "成本管理",
      desc: "生产成本归集与成本核算",
      icon: (
        <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
      color: "orange",
      onClick: () => {
        if (user.canAccessFinanceCost) {
          router.push("/finance/cost");
        } else {
          showToast("暂无权限，请联系管理员开通", "error");
        }
      },
    },
    {
      title: "生产",
      desc: "原辅料、包装、成品库存管理",
      icon: (
        <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
      color: "cyan",
      onClick: () => {
        if (user.canAccessInventory) {
          router.push("/inventory");
        } else {
          showToast("暂无权限，请联系管理员开通", "error");
        }
      },
    },
  ];

  const colorMap: Record<string, { bg: string; text: string; ring: string }> = {
    emerald: { bg: "bg-emerald-100", text: "text-emerald-600", ring: "hover:ring-emerald-400" },
    blue: { bg: "bg-blue-100", text: "text-blue-600", ring: "hover:ring-blue-400" },
    indigo: { bg: "bg-indigo-100", text: "text-indigo-600", ring: "hover:ring-indigo-400" },
    purple: { bg: "bg-purple-100", text: "text-purple-600", ring: "hover:ring-purple-400" },
    amber: { bg: "bg-amber-100", text: "text-amber-600", ring: "hover:ring-amber-400" },
    orange: { bg: "bg-orange-100", text: "text-orange-600", ring: "hover:ring-orange-400" },
    cyan: { bg: "bg-cyan-100", text: "text-cyan-600", ring: "hover:ring-cyan-400" },
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="mb-8 flex flex-col items-center">
        <Image
          src="/company/logo.png"
          alt={process.env.NEXT_PUBLIC_COMPANY_NAME || "公司"}
          width={200}
          height={60}
          className="h-auto w-auto max-w-[200px] object-contain"
        />
        <h1 className="mt-4 text-2xl font-bold text-gray-800">
          {process.env.NEXT_PUBLIC_APP_NAME || "工作台"}
        </h1>
        <p className="mt-1 text-sm text-gray-500">欢迎，{user.name}</p>
      </div>

      <div className="grid w-full max-w-4xl grid-cols-2 gap-4 md:grid-cols-3">
        {entries.map((entry) => {
          const c = colorMap[entry.color];
          return (
            <button
              key={entry.title}
              onClick={entry.onClick}
              className={`group flex flex-col items-center rounded-xl bg-white p-6 shadow-sm transition-all hover:shadow-md hover:ring-2 ${c.ring}`}
            >
              <div className={`mb-3 flex h-14 w-14 items-center justify-center rounded-full ${c.bg} ${c.text}`}>
                {entry.icon}
              </div>
              <h2 className="text-base font-semibold text-gray-800">{entry.title}</h2>
              <p className="mt-1 text-xs text-gray-500">{entry.desc}</p>
            </button>
          );
        })}
      </div>

      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
    </div>
  );
}
