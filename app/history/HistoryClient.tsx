"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import UserMenu from "@/app/components/UserMenu";
import NavLink from "@/app/components/NavLink";
import { SessionUser } from '@/lib/types';

interface ReportItemData {
  id: number;
  category: string;
  plan: string;
  completion: string | null;
  nextGoal: string | null;
  sortOrder: number;
}

interface Report {
  id: number;
  date: string;
  taskName: string;
  notes: string | null;
  version: number;
  reportGroupId?: number | null;
  items: ReportItemData[];
  user?: {
    name: string;
    departmentName: string | null;
  };
}

export default function HistoryPage({ hideShell }: { hideShell?: boolean }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchReports() {
      try {
        // 获取所有报告（无过滤 = 用户自己的报告）
        const res = await fetch("/api/reports");
        if (!res.ok) {
          setReports([]);
          setLoading(false);
          return;
        }
        const data = await res.json();
        const allReports: Report[] = data.reports || [];

        // 排序
        allReports.sort((a, b) => b.date.localeCompare(a.date));

        setReports(allReports);
      } catch {
        router.push("/login");
      }
      setLoading(false);
    }
    async function fetchUserAndReports() {
      try {
        const userRes = await fetch("/api/auth/me");
        if (!userRes.ok) {
          router.push("/login");
          return;
        }
        const userData = await userRes.json();
        if (!cancelled) setUser(userData.user);
        await fetchReports();
      } catch {
        router.push("/login");
      }
    }
    fetchUserAndReports();
    return () => { cancelled = true; };
  }, [router]);

  function renderItems(items: ReportItemData[], category: string) {
    const filtered = items
      .filter((i) => i.category === category)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    if (filtered.length === 0) return null;

    return (
      <div className="space-y-2">
        {filtered.map((item, index) => (
          <div key={item.id} className="rounded-md bg-gray-50 p-3">
            <div className="mb-1 text-xs font-medium text-gray-500">
              第 {index + 1} 条
            </div>
            <div className="grid grid-cols-1 gap-1 text-sm md:grid-cols-2">
              <div>
                <span className="text-xs text-gray-400">完成：</span>
                <span className="text-gray-700">{item.completion || "-"}</span>
              </div>
              <div>
                <span className="text-xs text-gray-400">目标：</span>
                <span className="text-gray-700">{item.nextGoal || "-"}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">加载中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h2 className="mb-6 text-xl font-semibold text-gray-800">历史报告</h2>

        {reports.length === 0 ? (
          <div className="rounded-lg bg-white p-8 text-center shadow-sm">
            <p className="text-gray-500">暂无报告记录</p>
            <Link href="/reports" className="mt-2 inline-block text-sm text-emerald-500 hover:underline">
              去填写第一份报告
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {reports.map((report) => (
              <div key={report.id} className="rounded-lg bg-white p-4 shadow-sm">
                <div
                  className="flex cursor-pointer items-center justify-between"
                  onClick={() => setExpanded(expanded === report.id ? null : report.id)}
                >
                  <div>
                    <h3 className="font-medium text-gray-800">
                      {report.date}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {report.taskName}
                      {report.user?.name && (
                        <span className="ml-2 text-xs text-gray-400">
                          填写人：{report.user.name}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {report.version > 1 && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                        V{report.version}
                      </span>
                    )}
                    <span className="text-sm text-gray-400">
                      {expanded === report.id ? "收起" : "展开"}
                    </span>
                  </div>
                </div>

                {expanded === report.id && (
                  <div className="mt-4 space-y-4 border-t pt-4">
                    {/* 日常工作 */}
                    {report.items.some((i) => i.category === "routine") && (
                      <div>
                        <h4 className="mb-2 text-sm font-semibold text-emerald-700">日常工作</h4>
                        {renderItems(report.items, "routine")}
                      </div>
                    )}

                    {/* 其他工作 */}
                    {report.items.some((i) => i.category === "non-routine") && (
                      <div>
                        <h4 className="mb-2 text-sm font-semibold text-gray-700">其他工作</h4>
                        {renderItems(report.items, "non-routine")}
                      </div>
                    )}

                    {/* 备注 */}
                    {report.notes && (
                      <div className="text-sm">
                        <span className="font-medium text-gray-700">备注：</span>
                        <span className="text-gray-600">{report.notes}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
