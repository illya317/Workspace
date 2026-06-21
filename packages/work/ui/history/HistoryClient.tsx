"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EmptyStateCard, PanelCard, SectionCard, StatusBadge } from "@workspace/core/ui";
import { DatabasePageFrame } from "@workspace/core/ui";
import { SessionUser } from "@workspace/platform/types";

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

export default function HistoryPage({ hideShell: _hideShell }: { hideShell?: boolean }) {
  const router = useRouter();
  const [_user, setUser] = useState<SessionUser | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchReports() {
      try {
        // 获取所有报告（无过滤 = 用户自己的报告）
        const res = await fetch(workspacePath("/api/modules/work/reports"));
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
        const userRes = await fetch(workspacePath("/api/auth/me"));
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
          <div key={item.id} className="border-l border-slate-200 pl-3">
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
      <DatabasePageFrame>
        <EmptyStateCard>加载中...</EmptyStateCard>
      </DatabasePageFrame>
    );
  }

  return (
    <DatabasePageFrame>
      <SectionCard title="历史报告">
        {reports.length === 0 ? (
          <EmptyStateCard compact={false}>
            暂无报告记录
            <Link href="/work/reports" className="mt-2 inline-block text-sm text-emerald-500 hover:underline">
              去填写第一份报告
            </Link>
          </EmptyStateCard>
        ) : (
          <div className="space-y-4">
            {reports.map((report) => (
              <PanelCard key={report.id} bodyClassName="p-4">
                <div
                  className="flex cursor-pointer items-center gap-3"
                  onClick={() => setExpanded(expanded === report.id ? null : report.id)}
                >
                  <div>
                    <div className="font-medium text-gray-800">
                      {report.date}
                    </div>
                    <p className="text-sm text-gray-500">
                      {report.taskName}
                      {report.user?.name && (
                        <span className="ml-2 text-xs text-gray-400">
                          填写人：{report.user.name}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    {report.version > 1 && (
                      <StatusBadge label={`V${report.version}`} variant="green" className="rounded-full" />
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
                        <div className="mb-2 text-sm font-semibold text-emerald-700">日常工作</div>
                        {renderItems(report.items, "routine")}
                      </div>
                    )}

                    {/* 其他工作 */}
                    {report.items.some((i) => i.category === "non-routine") && (
                      <div>
                        <div className="mb-2 text-sm font-semibold text-gray-700">其他工作</div>
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
              </PanelCard>
            ))}
          </div>
        )}
      </SectionCard>
    </DatabasePageFrame>
  );
}
