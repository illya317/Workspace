"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import UserMenu from "@/app/components/UserMenu";
import type { HRUser as User } from "../types";

export default function AnalyticsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (!data.user || !data.user.canAccessHR) {
          router.push("/portal");
          return;
        }
        setUser(data.user);
        setLoading(false);
      })
      .catch(() => router.push("/portal"));
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">加载中...</p>
      </div>
    );
  }

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
            <span className="text-sm font-medium text-gray-700">人力分析</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/hr")}
              className="text-sm text-gray-500 hover:text-emerald-600"
            >
              组织人事
            </button>
            <button
              onClick={() => router.push("/hr/performance")}
              className="text-sm text-gray-500 hover:text-emerald-600"
            >
              考勤绩效
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
        <div className="flex min-h-[300px] items-center justify-center rounded-lg bg-white shadow-sm">
          <p className="text-sm text-gray-400">人力分析模块开发中...</p>
        </div>
      </main>
    </div>
  );
}
