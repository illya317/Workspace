"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Image from "next/image";
import NavLink from "@/app/components/NavLink";
import UserMenu from "@/app/components/UserMenu";
import { SessionUser } from '@/lib/types';

interface PositionDescDetail {
  id: number; code: string; name: string;
  departmentName: string | null; reportTo: string | null;
  positionPurpose: string | null; summary: string | null;
  headcount: number | null; version: string | null; effectiveDate: string | null;
  details: Record<string, unknown> | null;
}

function s(val: unknown, fb = "—"): string {
  if (val === null || val === undefined || val === "") return fb;
  return String(val);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="mb-6"><h2 className="mb-3 border-l-4 border-emerald-600 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-800">{title}</h2>{children}</div>;
}

function Pair({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined || value === "") return null;
  return <div className="mb-1.5 text-sm"><strong className="text-gray-700">{label}：</strong><span className="text-gray-600">{String(value)}</span></div>;
}

export default function GmpPositionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const code = params.code as string;
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [pos, setPos] = useState<PositionDescDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.ok ? r.json() : Promise.reject()).then(d => setUser(d.user)).catch(() => router.push("/login"));
  }, [router]);

  useEffect(() => {
    if (!code) return;
    fetch(`/api/position-descriptions?code=${encodeURIComponent(code)}`)
      .then(r => r.ok ? r.json() : Promise.reject()).then(d => { setPos(d.positionDescription); setLoading(false); })
      .catch(() => { setError("获取失败"); setLoading(false); });
  }, [code]);

  if (loading) return <div className="flex min-h-screen items-center justify-center"><p className="text-gray-500">加载中...</p></div>;
  if (error || !pos) return <div className="flex min-h-screen items-center justify-center"><div className="text-center"><p className="text-gray-500">{error || "未找到"}</p><button onClick={() => router.push("/docs/positions/GMP")} className="mt-4 text-sm text-emerald-600 hover:underline">返回列表</button></div></div>;

  const d = pos.details || {};

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Image src="/company/logo.png" alt="logo" width={100} height={30} className="h-auto w-auto max-w-[100px] object-contain" />
            <span className="text-sm text-gray-400">|</span><span className="text-sm font-medium text-gray-600">文档中心</span>
          </div>
          <div className="flex items-center gap-5">
            <button onClick={() => router.push("/portal")} className="text-sm text-gray-500 hover:text-emerald-600">返回入口</button>
            <NavLink href="/reports">工作汇报</NavLink><NavLink href="/works">工作清单</NavLink><NavLink href="/history">历史记录</NavLink>
            <UserMenu user={user} />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
          <button onClick={() => router.push("/docs")} className="hover:text-emerald-600">文档中心</button>
          <span>/</span>
          <button onClick={() => router.push("/docs/positions/GMP")} className="hover:text-emerald-600">岗位说明书</button>
          <span>/</span><span className="text-gray-700">{pos.name}</span>
        </div>

        <div className="mb-6 border-b-2 border-gray-800 pb-4 text-center">
          <h1 className="text-xl font-bold text-gray-900">岗位说明书</h1>
          <div className="mt-1 text-sm text-gray-500">
            文件编号：{s(pos.code)} &nbsp;|&nbsp; 版本：{s(pos.version)} &nbsp;|&nbsp; 生效日期：{s(pos.effectiveDate)}
          </div>
        </div>

        <Section title="基本信息">
          <Pair label="岗位名称" value={pos.name} />
          <Pair label="所属部门" value={pos.departmentName} />
          <Pair label="直接上级" value={pos.reportTo} />
          {Array.isArray(d.subordinates) && d.subordinates.length > 0 ? (
            <div className="mb-1.5 text-sm">
              <strong className="text-gray-700">直接下级：</strong>
              {d.subordinates.map((name: string, i: number) => (
                <span key={i}>
                  {i > 0 && "、"}
                  <a href={`/docs/positions/GMP?search=${encodeURIComponent(name)}`} className="text-emerald-600 hover:underline">{name}</a>
                </span>
              ))}
            </div>
          ) : (
            <Pair label="直接下级" value={s(d.subordinates)} />
          )}
          <Pair label="编制人数" value={pos.headcount} />
        </Section>

        {(pos.positionPurpose || pos.summary) && (
          <Section title="岗位概述">
            <Pair label="岗位目的" value={pos.positionPurpose} />
            <Pair label="职责概要" value={pos.summary} />
          </Section>
        )}

        {Array.isArray(d.duties) && d.duties.length > 0 && (
          <Section title="岗位职责">
            {d.duties.map((duty: Record<string, unknown>, i: number) => (
              <div key={i} className="mb-4">
                <div className="mb-1 text-sm font-semibold text-gray-700">{i + 1}. {s(duty.title)}</div>
                {Array.isArray(duty.items) && duty.items.length > 0 && (
                  <ul className="list-disc pl-8 text-sm text-gray-600 space-y-0.5">
                    {duty.items.map((item: string, j: number) => <li key={j}>{item}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </Section>
        )}

        {!!(d.education || d.major || d.experience || d.training) && (
          <Section title="任职资格">
            <Pair label="教育水平" value={d.education} />
            <Pair label="专业要求" value={d.major} />
            <Pair label="工作经验" value={d.experience} />
            <Pair label="培训经历" value={d.training} />
          </Section>
        )}

        {!!(d.workingConditions || d.workSchedule) && (
          <Section title="工作条件">
            <Pair label="工作环境" value={d.workingConditions} />
            <Pair label="工作时间" value={d.workSchedule} />
          </Section>
        )}

        {Array.isArray(d.changeHistory) && d.changeHistory.length > 0 && (
          <Section title="变更历史">
            <table className="w-full border-collapse text-sm">
              <thead><tr className="bg-gray-50">
                <th className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-600">版本</th>
                <th className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-600">文件名称</th>
                <th className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-600">生效日期</th>
              </tr></thead>
              <tbody>
                {d.changeHistory.map((h: Record<string, unknown>, i: number) => (
                  <tr key={i}>
                    <td className="border border-gray-200 px-3 py-2 text-gray-700">{String(h.version ?? "")}</td>
                    <td className="border border-gray-200 px-3 py-2 text-gray-700">{String(h.documentName ?? "")}</td>
                    <td className="border border-gray-200 px-3 py-2 text-gray-700">{String(h.effectiveDate ?? "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        <div className="mt-8 text-center">
          <button onClick={() => router.push("/docs/positions/GMP")} className="rounded-md bg-gray-100 px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">← 返回列表</button>
        </div>
      </main>
    </div>
  );
}
