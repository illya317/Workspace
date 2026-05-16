"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

interface User {
  id: number;
  name: string;
  canAccessWorks: boolean;
  canAccessHR: boolean;
}

export default function PortalPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ show: boolean; message: string }>({ show: false, message: "" });

  function showToast(message: string) {
    setToast({ show: true, message });
    setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 3000);
  }

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (!data.user) {
          router.push("/login");
          return;
        }
        setUser(data.user);
        setLoading(false);
      })
      .catch(() => router.push("/login"));
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">加载中...</p>
      </div>
    );
  }

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
        <p className="mt-1 text-sm text-gray-500">欢迎，{user?.name}</p>
      </div>

      <div className="grid w-full max-w-2xl grid-cols-1 gap-6 md:grid-cols-2">
        {/* 工作汇报 */}
        <button
          onClick={() => router.push("/reports")}
          className="group flex flex-col items-center rounded-xl bg-white p-8 shadow-sm transition-all hover:shadow-md hover:ring-2 hover:ring-emerald-400"
        >
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-800">工作汇报</h2>
          <p className="mt-2 text-sm text-gray-500">填写周报、月报、季报、年报</p>
        </button>

        {/* 人事行政管理 */}
        <button
          onClick={() => {
            if (user?.canAccessHR) {
              router.push("/hr");
            } else {
              showToast("暂无权限，请联系管理员开通");
            }
          }}
          className="group flex flex-col items-center rounded-xl bg-white p-8 shadow-sm transition-all hover:shadow-md hover:ring-2 hover:ring-blue-400"
        >
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-800">人事行政管理</h2>
          <p className="mt-2 text-sm text-gray-500">花名册、考勤、工作查看、绩效</p>
        </button>
      </div>

      {/* Toast */}
      {toast.show && (
        <div className="fixed top-6 left-1/2 z-50 -translate-x-1/2">
          <div className="rounded-md bg-red-500 px-4 py-2 text-sm text-white shadow-lg">
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
