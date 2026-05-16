"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

interface User {
  id: number;
  name: string;
}

interface ReportType {
  key: string;
  name: string;
  desc: string;
  available: boolean;
  href: string;
  icon: React.ReactNode;
  bg: string;
  text: string;
  ring: string;
}

export default function ReportsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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

  const reportTypes: ReportType[] = [
    {
      key: "weekly",
      name: "周报",
      desc: "填写本周工作汇报",
      available: true,
      href: "/dashboard",
      bg: "bg-emerald-100",
      text: "text-emerald-600",
      ring: "hover:ring-emerald-400",
      icon: (
        <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      key: "monthly",
      name: "月报",
      desc: "即将上线",
      available: false,
      href: "#",
      bg: "bg-gray-100",
      text: "text-gray-400",
      ring: "",
      icon: (
        <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      key: "quarterly",
      name: "季报",
      desc: "即将上线",
      available: false,
      href: "#",
      bg: "bg-gray-100",
      text: "text-gray-400",
      ring: "",
      icon: (
        <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      key: "yearly",
      name: "年报",
      desc: "即将上线",
      available: false,
      href: "#",
      bg: "bg-gray-100",
      text: "text-gray-400",
      ring: "",
      icon: (
        <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ];

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

      <div className="grid w-full max-w-3xl grid-cols-2 gap-4 md:grid-cols-4">
        {reportTypes.map((rt) => (
          <button
            key={rt.key}
            onClick={() => {
              if (rt.available) {
                router.push(rt.href);
              }
            }}
            disabled={!rt.available}
            className={`group flex flex-col items-center rounded-xl bg-white p-6 shadow-sm transition-all ${
              rt.available
                ? `hover:shadow-md hover:ring-2 ${rt.ring} cursor-pointer`
                : "cursor-not-allowed opacity-60"
            }`}
          >
            <div className={`mb-3 flex h-14 w-14 items-center justify-center rounded-full ${rt.bg} ${rt.text}`}>
              {rt.icon}
            </div>
            <h2 className="text-base font-semibold text-gray-800">{rt.name}</h2>
            <p className="mt-1 text-xs text-gray-500">{rt.desc}</p>
          </button>
        ))}
      </div>

      <button
        onClick={() => router.push("/portal")}
        className="mt-8 text-sm text-gray-500 hover:text-emerald-600"
      >
        返回入口
      </button>
    </div>
  );
}
