"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Image from "next/image";
import NavLink from "@/app/components/NavLink";
import UserMenu from "@/app/components/UserMenu";
import { SessionUser } from '@/lib/types';

interface PositionDescDetail {
  id: number;
  code: string;
  name: string;
  departmentName: string | null;
  reportTo: string | null;
  positionPurpose: string | null;
  summary: string | null;
  headcount: number | null;
  version: string | null;
  effectiveDate: string | null;
  details: Record<string, any> | null;
}

function s(val: any, fallback = "—"): string {
  if (val === null || val === undefined || val === "") return fallback;
  return String(val);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="mb-3 border-l-4 border-emerald-600 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-800">{title}</h2>
      {children}
    </div>
  );
}

function InfoGrid({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  const valid = rows.filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (valid.length === 0) return null;
  return (
    <div className="overflow-hidden rounded border border-gray-200">
      {valid.map(([label, value], i) => (
        <div key={i} className={`grid grid-cols-[120px_1fr] ${i < valid.length - 1 ? "border-b border-gray-200" : ""}`}>
          <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">{label}</div>
          <div className="px-3 py-2 text-sm text-gray-700">{value}</div>
        </div>
      ))}
    </div>
  );
}

export default function GmpPositionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const code = params.code as string;

  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [position, setPosition] = useState<PositionDescDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/me").then((r) => { if (!r.ok) throw new Error("not auth"); return r.json(); })
      .then((data) => setUser(data.user)).catch(() => router.push("/login"));
  }, [router]);

  useEffect(() => {
    if (!code) return;
    fetch(`/api/position-descriptions?code=${encodeURIComponent(code)}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => { setPosition(data.positionDescription); setLoading(false); })
      .catch(() => { setError("获取岗位说明书失败"); setLoading(false); });
  }, [code]);

  if (loading) return <div className="flex min-h-screen items-center justify-center"><p className="text-gray-500">加载中...</p></div>;
  if (error || !position) return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <p className="text-gray-500">{error || "未找到该岗位说明书"}</p>
        <button onClick={() => router.push("/docs/positions/GMP")} className="mt-4 text-sm text-emerald-600 hover:underline">返回列表</button>
      </div>
    </div>
  );

  const d = position.details || {};

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Image src="/company/logo.png" alt="logo" width={100} height={30} className="h-auto w-auto max-w-[100px] object-contain" />
            <span className="text-sm text-gray-400">|</span>
            <span className="text-sm font-medium text-gray-600">文档中心</span>
          </div>
          <div className="flex items-center gap-5">
            <button onClick={() => router.push("/portal")} className="text-sm text-gray-500 hover:text-emerald-600">返回入口</button>
            <NavLink href="/reports">工作汇报</NavLink>
            <NavLink href="/works">工作清单</NavLink>
            <NavLink href="/history">历史记录</NavLink>
            <UserMenu user={user} />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
          <button onClick={() => router.push("/docs")} className="hover:text-emerald-600">文档中心</button>
          <span>/</span>
          <button onClick={() => router.push("/docs/positions/GMP")} className="hover:text-emerald-600">GMP 岗位说明书</button>
          <span>/</span>
          <span className="text-gray-700">{position.name}</span>
        </div>

        <div className="mb-6 border-b-2 border-gray-800 pb-4 text-center">
          <h1 className="text-xl font-bold text-gray-900">岗位说明书</h1>
          <div className="mt-1 text-sm text-gray-500">
            文件编号：{s(position.code)} &nbsp;&nbsp;|&nbsp;&nbsp; 版本号：{s(position.version)} &nbsp;&nbsp;|&nbsp;&nbsp; 生效日期：{s(position.effectiveDate)}
          </div>
        </div>

        <Section title="一、岗位基本信息">
          <InfoGrid rows={[
            ["岗位名称", position.name], ["所属部门", position.departmentName], ["直接上级", position.reportTo],
            ["直接下级", Array.isArray(d.subordinates) ? d.subordinates.join("、") : s(d.subordinates)],
            ["岗位编制", position.headcount],
          ]} />
        </Section>

        {(position.positionPurpose || position.summary) && (
          <Section title="二、岗位目的与职责概要">
            {position.positionPurpose && <div className="mb-2 text-sm"><strong className="text-gray-700">岗位目的：</strong><span className="text-gray-600">{position.positionPurpose}</span></div>}
            {position.summary && <div className="text-sm"><strong className="text-gray-700">职责概要：</strong><span className="text-gray-600">{position.summary}</span></div>}
          </Section>
        )}

        {(d.purpose || d.scope) && (
          <Section title="三、目的与适用范围">
            {d.purpose && <div className="mb-2 text-sm"><strong className="text-gray-700">目的：</strong><span className="text-gray-600">{d.purpose}</span></div>}
            {d.scope && <div className="text-sm"><strong className="text-gray-700">范围：</strong><span className="text-gray-600">{d.scope}</span></div>}
          </Section>
        )}

        {Array.isArray(d.duties) && d.duties.length > 0 && (
          <Section title="四、岗位职责">
            {d.duties.map((duty: any, idx: number) => (
              <div key={idx} className="mb-4">
                <div className="mb-1 text-sm font-semibold text-gray-700">职责{idx + 1}：{s(duty.title)}</div>
                {Array.isArray(duty.items) && duty.items.length > 0 && (
                  <ol className="list-decimal pl-5 text-sm text-gray-600">
                    {duty.items.map((item: string, i: number) => <li key={i} className="mb-1">{item}</li>)}
                  </ol>
                )}
              </div>
            ))}
          </Section>
        )}

        {d.externalCollaboration && (
          <Section title="五、协作关系">
            <div className="mb-2 text-sm"><strong className="text-gray-700">外部协作：</strong><span className="text-gray-600">{d.externalCollaboration}</span></div>
            {Array.isArray(d.distributionDeptNames) && d.distributionDeptNames.length > 0 && (
              <div className="text-sm"><strong className="text-gray-700">发放范围：</strong><span className="text-gray-600">{d.distributionDeptNames.join("、")}</span></div>
            )}
            {Array.isArray(d.trainingPositionNames) && d.trainingPositionNames.length > 0 && (
              <div className="text-sm"><strong className="text-gray-700">培训范围：</strong><span className="text-gray-600">{d.trainingPositionNames.join("、")}</span></div>
            )}
          </Section>
        )}

        {(d.education || d.major || d.experience || d.training || d.skills || d.other) && (
          <Section title="六、任职资格">
            <InfoGrid rows={[
              ["教育水平", s(d.education)], ["专业要求", s(d.major)], ["工作经验", s(d.experience)],
              ["培训经历", s(d.training)], ["技能要求", Array.isArray(d.skills) ? d.skills.join("、") : null],
              ["其他要求", s(d.other) !== "无。" ? s(d.other) : null],
            ]} />
          </Section>
        )}

        {(d.workingConditions || d.workSchedule || d.equipment) && (
          <Section title="七、工作条件">
            <InfoGrid rows={[
              ["工作环境", s(d.workingConditions)], ["工作时间", s(d.workSchedule)],
              ["使用设备", Array.isArray(d.equipment) ? d.equipment.join("、") : s(d.equipment)],
            ]} />
          </Section>
        )}

        <Section title="八、审批">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-3 py-2 font-semibold text-gray-600">起草人</th>
                <th className="border border-gray-200 px-3 py-2 font-semibold text-gray-600">审核人</th>
                <th className="border border-gray-200 px-3 py-2 font-semibold text-gray-600">审核人</th>
                <th className="border border-gray-200 px-3 py-2 font-semibold text-gray-600">批准人</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-200 px-3 py-2 text-center text-gray-700">{s(d.drafter)}</td>
                <td className="border border-gray-200 px-3 py-2 text-center text-gray-700">{s(d.reviewer1)}</td>
                <td className="border border-gray-200 px-3 py-2 text-center text-gray-700">{s(d.reviewer2)}</td>
                <td className="border border-gray-200 px-3 py-2 text-center text-gray-700">{s(d.approver)}</td>
              </tr>
            </tbody>
          </table>
        </Section>

        {Array.isArray(d.changeHistory) && d.changeHistory.length > 0 && (
          <Section title="九、变更历史">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-600">版本</th>
                  <th className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-600">文件名称</th>
                  <th className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-600">生效日期</th>
                  <th className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-600">批准人</th>
                </tr>
              </thead>
              <tbody>
                {d.changeHistory.map((h: any, i: number) => (
                  <tr key={i}>
                    <td className="border border-gray-200 px-3 py-2 text-gray-700">{h.version}</td>
                    <td className="border border-gray-200 px-3 py-2 text-gray-700">{h.documentName}</td>
                    <td className="border border-gray-200 px-3 py-2 text-gray-700">{h.effectiveDate}</td>
                    <td className="border border-gray-200 px-3 py-2 text-gray-700">{h.approver}</td>
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
