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
  subordinates: string | null;
  positionPurpose: string | null;
  summary: string | null;
  headcount: number | null;
  version: string | null;
  effectiveDate: string | null;
  company: string | null;
  details: Record<string, any> | null;
}

function safe(val: string | number | null | undefined, fallback = "—"): string {
  if (val === null || val === undefined || val === "") return fallback;
  return String(val);
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <h2 className="mb-3 border-l-4 border-emerald-600 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-800">
        {title}
      </h2>
      {children}
    </div>
  );
}

function InfoGrid({
  rows,
}: {
  rows: Array<[string, React.ReactNode]>;
}) {
  const validRows = rows.filter(([, val]) => val !== null && val !== undefined && val !== "");
  if (validRows.length === 0) return null;
  return (
    <div className="overflow-hidden rounded border border-gray-200">
      {validRows.map(([label, value], idx) => (
        <div
          key={idx}
          className={`grid grid-cols-[120px_1fr] ${
            idx < validRows.length - 1 ? "border-b border-gray-200" : ""
          }`}
        >
          <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
            {label}
          </div>
          <div className="px-3 py-2 text-sm text-gray-700">{value}</div>
        </div>
      ))}
    </div>
  );
}

function TagList({ items }: { items: Array<{ value?: string | null }> }) {
  const filtered = items?.filter((i) => i?.value) || [];
  if (filtered.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {filtered.map((item, i) => (
        <span
          key={i}
          className="rounded bg-blue-50 px-2.5 py-1 text-xs text-blue-700 border border-blue-100"
        >
          {item.value}
        </span>
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
    fetch("/api/auth/me")
      .then((r) => {
        if (!r.ok) throw new Error("not auth");
        return r.json();
      })
      .then((data) => {
        setUser(data.user);
      })
      .catch(() => router.push("/login"));
  }, [router]);

  useEffect(() => {
    if (!code) return;
    fetch(`/api/position-descriptions?code=${encodeURIComponent(code)}`)
      .then((r) => {
        if (!r.ok) throw new Error("获取失败");
        return r.json();
      })
      .then((data) => {
        setPosition(data.positionDescription);
        setLoading(false);
      })
      .catch(() => {
        setError("获取岗位说明书失败");
        setLoading(false);
      });
  }, [code]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">加载中...</p>
      </div>
    );
  }

  if (error || !position) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">{error || "未找到该岗位说明书"}</p>
          <button
            onClick={() => router.push("/docs/positions/GMP")}
            className="mt-4 text-sm text-emerald-600 hover:underline"
          >
            返回列表
          </button>
        </div>
      </div>
    );
  }

  const d = position.details || {};

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Image
              src="/company/logo.png"
              alt={process.env.NEXT_PUBLIC_COMPANY_NAME || "公司"}
              width={100}
              height={30}
              className="h-auto w-auto max-w-[100px] object-contain"
            />
            <span className="text-sm text-gray-400">|</span>
            <span className="text-sm font-medium text-gray-600">文档中心</span>
          </div>
          <div className="flex items-center gap-5">
            <button
              onClick={() => router.push("/portal")}
              className="text-sm text-gray-500 hover:text-emerald-600"
            >
              返回入口
            </button>
            <NavLink href="/reports">工作汇报</NavLink>
            <NavLink href="/works">工作清单</NavLink>
            <NavLink href="/history">历史记录</NavLink>
            <UserMenu user={user} />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {/* 面包屑 */}
        <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
          <button
            onClick={() => router.push("/docs")}
            className="hover:text-emerald-600"
          >
            文档中心
          </button>
          <span>/</span>
          <button
            onClick={() => router.push("/docs/positions/GMP")}
            className="hover:text-emerald-600"
          >
            GMP 岗位说明书
          </button>
          <span>/</span>
          <span className="text-gray-700">{position.name}</span>
        </div>

        {/* 头部 */}
        <div className="mb-6 border-b-2 border-gray-800 pb-4 text-center">
          <h1 className="text-xl font-bold text-gray-900">岗位说明书</h1>
          <div className="mt-1 text-sm text-gray-500">
            文件编号：{safe(position.code)}
            &nbsp;&nbsp;|&nbsp;&nbsp;
            版本号：{safe(position.version)}
            &nbsp;&nbsp;|&nbsp;&nbsp;
            生效日期：{safe(position.effectiveDate)}
          </div>
        </div>

        {/* 基本信息 */}
        <Section title="一、岗位基本信息">
          <InfoGrid
            rows={[
              ["岗位名称", position.name],
              ["所属部门", position.departmentName],
              ["直接上级", position.reportTo],
              ["直接下级", d.subordinates || position.subordinates],
              ["岗位编制", position.headcount],
            ]}
          />
        </Section>

        {/* 岗位目的与职责概要 */}
        {(position.positionPurpose || position.summary) && (
          <Section title="二、岗位目的与职责概要">
            {position.positionPurpose && (
              <div className="mb-2 text-sm">
                <strong className="text-gray-700">岗位目的：</strong>
                <span className="text-gray-600">{position.positionPurpose}</span>
              </div>
            )}
            {position.summary && (
              <div className="text-sm">
                <strong className="text-gray-700">职责概要：</strong>
                <span className="text-gray-600">{position.summary}</span>
              </div>
            )}
          </Section>
        )}

        {/* 目的与范围 */}
        {(d.purpose?.value || d.scope?.value) && (
          <Section title="三、目的与适用范围">
            {d.purpose?.value && (
              <div className="mb-2 text-sm">
                <strong className="text-gray-700">目的：</strong>
                <span className="text-gray-600">{d.purpose.value}</span>
              </div>
            )}
            {d.scope?.value && (
              <div className="text-sm">
                <strong className="text-gray-700">范围：</strong>
                <span className="text-gray-600">{d.scope.value}</span>
              </div>
            )}
          </Section>
        )}

        {/* 岗位职责 */}
        {d.duties && d.duties.length > 0 && (
          <Section title="四、岗位职责">
            {d.duties.map((duty: any, idx: number) => (
              <div key={idx} className="mb-4">
                <div className="mb-1 text-sm font-semibold text-gray-700">
                  职责{idx + 1}：{safe(duty.title?.value)}
                </div>
                {duty.items && duty.items.length > 0 && (
                  <ol className="list-decimal pl-5 text-sm text-gray-600">
                    {duty.items
                      .filter((item: any) => item.value)
                      .map((item: any, i: number) => (
                        <li key={i} className="mb-1">
                          {item.value}
                        </li>
                      ))}
                  </ol>
                )}
              </div>
            ))}
          </Section>
        )}

        {/* 协作关系 */}
        {(d.externalCollaboration?.value ||
          d.internalCollaborationNames?.some((n: any) => n.value)) && (
          <Section title="五、协作关系">
            {d.externalCollaboration?.value && (
              <div className="mb-2 text-sm">
                <strong className="text-gray-700">外部协作：</strong>
                <span className="text-gray-600">
                  {d.externalCollaboration.value}
                </span>
              </div>
            )}
            {d.internalCollaborationNames?.some((n: any) => n.value) && (
              <div className="text-sm">
                <strong className="text-gray-700">内部协作：</strong>
                <div className="mt-1">
                  <TagList items={d.internalCollaborationNames} />
                </div>
              </div>
            )}
          </Section>
        )}

        {/* 发放与培训范围 */}
        {(d.distributionDeptNames?.some((n: any) => n.value) ||
          d.trainingPositionNames?.some((n: any) => n.value)) && (
          <Section title="六、发放与培训范围">
            {d.distributionDeptNames?.some((n: any) => n.value) && (
              <div className="mb-2 text-sm">
                <strong className="text-gray-700">发放范围：</strong>
                <div className="mt-1">
                  <TagList items={d.distributionDeptNames} />
                </div>
              </div>
            )}
            {d.trainingPositionNames?.some((n: any) => n.value) && (
              <div className="text-sm">
                <strong className="text-gray-700">培训范围：</strong>
                <span className="text-gray-600">
                  {d.trainingPositionNames
                    .filter((n: any) => n.value)
                    .map((n: any) => n.value)
                    .join("、")}
                </span>
              </div>
            )}
          </Section>
        )}

        {/* 任职资格 */}
        {d.qualifications && (
          <Section title="七、任职资格">
            <InfoGrid
              rows={[
                ["教育水平", d.qualifications.education?.value],
                ["专业要求", d.qualifications.major?.value],
                ["工作经验", d.qualifications.experience?.value],
                ["培训经历", d.qualifications.training?.value],
                [
                  "技能要求",
                  d.qualifications.skills?.some((s: any) => s.value) ? (
                    <TagList items={d.qualifications.skills} />
                  ) : null,
                ],
                [
                  "其他要求",
                  d.qualifications.other?.value &&
                  d.qualifications.other.value !== "无。"
                    ? d.qualifications.other.value
                    : null,
                ],
              ]}
            />
          </Section>
        )}

        {/* 工作条件 */}
        {d.conditions && (
          <Section title="八、工作条件">
            <InfoGrid
              rows={[
                ["工作环境", d.conditions.workingConditions?.value],
                [
                  "使用设备",
                  d.conditions.equipment?.some((e: any) => e.value)
                    ? d.conditions.equipment
                        .filter((e: any) => e.value)
                        .map((e: any) => e.value)
                        .join("、")
                    : null,
                ],
                ["工作时间", d.conditions.workSchedule?.value],
              ]}
            />
          </Section>
        )}

        {/* 审批 */}
        <Section title="九、审批">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-3 py-2 font-semibold text-gray-600">
                  起草人
                </th>
                <th className="border border-gray-200 px-3 py-2 font-semibold text-gray-600">
                  审核人
                </th>
                <th className="border border-gray-200 px-3 py-2 font-semibold text-gray-600">
                  审核人
                </th>
                <th className="border border-gray-200 px-3 py-2 font-semibold text-gray-600">
                  批准人
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-200 px-3 py-2 text-center text-gray-700">
                  {safe(d.drafter?.value)}
                </td>
                <td className="border border-gray-200 px-3 py-2 text-center text-gray-700">
                  {safe(d.reviewer1?.value)}
                </td>
                <td className="border border-gray-200 px-3 py-2 text-center text-gray-700">
                  {safe(d.reviewer2?.value)}
                </td>
                <td className="border border-gray-200 px-3 py-2 text-center text-gray-700">
                  {safe(d.approver?.value)}
                </td>
              </tr>
            </tbody>
          </table>
        </Section>

        {/* 变更历史 */}
        {d.changeHistory && d.changeHistory.length > 0 && (
          <Section title="十、变更历史">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-600">
                    版本
                  </th>
                  <th className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-600">
                    文件名称
                  </th>
                  <th className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-600">
                    生效日期
                  </th>
                  <th className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-600">
                    批准人
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.changeHistory.map((h: any, i: number) => (
                  <tr key={i}>
                    <td className="border border-gray-200 px-3 py-2 text-gray-700">
                      {h.version}
                    </td>
                    <td className="border border-gray-200 px-3 py-2 text-gray-700">
                      {h.documentName}
                    </td>
                    <td className="border border-gray-200 px-3 py-2 text-gray-700">
                      {h.effectiveDate}
                    </td>
                    <td className="border border-gray-200 px-3 py-2 text-gray-700">
                      {h.approver}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {/* 返回按钮 */}
        <div className="mt-8 text-center">
          <button
            onClick={() => router.push("/docs/positions/GMP")}
            className="rounded-md bg-gray-100 px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            ← 返回列表
          </button>
        </div>
      </main>
    </div>
  );
}
