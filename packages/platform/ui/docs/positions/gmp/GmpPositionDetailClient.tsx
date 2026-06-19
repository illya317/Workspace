"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable, PageContent, SectionCard, getToolbarActionClassName } from "@workspace/core/ui";
import type { DataTableColumn } from "@workspace/core/ui";

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
  return <SectionCard title={title} className="mb-6">{children}</SectionCard>;
}

function Pair({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined || value === "") return null;
  return <div className="mb-1.5 text-sm"><strong className="text-gray-700">{label}：</strong><span className="text-gray-600">{String(value)}</span></div>;
}

function formatWorkEnvironments(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return "";
      const record = item as Record<string, unknown>;
      const area = String(record.area || "").trim();
      const factors = Array.isArray(record.factors)
        ? record.factors.map((factor) => String(factor || "").trim()).filter(Boolean)
        : [];
      if (!area) return "";
      return factors.length ? `${area}（${factors.join("、")}）` : area;
    })
    .filter(Boolean)
    .join("；");
}

function formatExperienceRequirements(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return "";
      const record = item as Record<string, unknown>;
      const years = String(record.years || "").trim();
      const requirement = String(record.requirement || "").trim();
      return [years, requirement].filter(Boolean).join(" ");
    })
    .filter(Boolean)
    .join("；");
}

function formatMajorItems(value: unknown) {
  let raw = value;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return "";
    try {
      raw = JSON.parse(text);
    } catch {
      return text;
    }
  }
  if (!Array.isArray(raw)) return "";
  return raw
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (!item || typeof item !== "object" || Array.isArray(item)) return "";
      const record = item as Record<string, unknown>;
      return [record.category, record.specialty]
        .map((part) => String(part || "").trim())
        .filter(Boolean)
        .join("/");
    })
    .filter(Boolean)
    .join("、");
}

export default function GmpDetailClient({ code }: { code: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [pos, setPos] = useState<PositionDescDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!code) return;
    fetch(`/workspace/api/position-descriptions?code=${encodeURIComponent(code)}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { setPos(d.positionDescription); setLoading(false); })
      .catch(() => { setError("获取失败"); setLoading(false); });
  }, [code]);

  if (loading) return <div className="flex min-h-[300px] items-center justify-center"><p className="text-gray-500">加载中...</p></div>;
  if (error || !pos) return <div className="flex min-h-[300px] items-center justify-center"><div className="text-center"><p className="text-gray-500">{error || "未找到"}</p><button onClick={() => router.push("/docs/positions/GMP")} className="mt-4 text-sm text-emerald-600 hover:underline">返回列表</button></div></div>;

  const d = pos.details || {};
  const historyRows = Array.isArray(d.changeHistory) ? d.changeHistory as Record<string, unknown>[] : [];
  const historyColumns: DataTableColumn<Record<string, unknown>>[] = [
    { key: "version", label: "版本", required: true, render: (row) => <span className="text-slate-700">{String(row.version ?? "")}</span> },
    { key: "documentName", label: "文件名称", required: true, render: (row) => <span className="text-slate-700">{String(row.documentName ?? "")}</span> },
    { key: "effectiveDate", label: "生效日期", required: true, render: (row) => <span className="text-slate-700">{String(row.effectiveDate ?? "")}</span> },
  ];

  return (
    <PageContent className="py-8">
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <button onClick={() => router.push("/docs")} className="hover:text-emerald-600">文档中心</button>
        <span>/</span>
        <button onClick={() => router.push("/docs/positions/GMP")} className="hover:text-emerald-600">岗位说明书</button>
        <span>/</span><span className="text-gray-700">{pos.name}</span>
      </div>

      <div className="mb-6 border-b border-slate-200 pb-4 text-center">
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
                {i > 0 && "、"}<a href={`/docs/positions/GMP?search=${encodeURIComponent(name)}`} className="text-emerald-600 hover:underline">{name}</a>
              </span>
            ))}
          </div>
        ) : <Pair label="直接下级" value={s(d.subordinates)} />}
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

      {!!(d.education || formatMajorItems(d.major) || formatExperienceRequirements(d.experienceRequirements) || d.training) && (
        <Section title="任职资格">
          <Pair label="教育水平" value={d.education} />
          <Pair label="专业要求" value={formatMajorItems(d.major)} />
          <Pair label="工作经验" value={formatExperienceRequirements(d.experienceRequirements)} />
          <Pair label="培训经历" value={d.training} />
        </Section>
      )}

      {!!(formatWorkEnvironments(d.workEnvironments) || d.workSchedule) && (
        <Section title="工作条件">
          <Pair label="工作环境" value={formatWorkEnvironments(d.workEnvironments)} />
          <Pair label="工作时间" value={d.workSchedule} />
        </Section>
      )}

      {Array.isArray(d.changeHistory) && d.changeHistory.length > 0 && (
        <SectionCard title="变更历史" bodyClassName="overflow-x-auto p-0" className="mb-6">
          <DataTable
            rows={historyRows}
            columns={historyColumns}
            visibleColumns={[]}
            density="compact"
            rowKey={(row) => `${String(row.version ?? "")}:${String(row.documentName ?? "")}:${String(row.effectiveDate ?? "")}`}
          />
        </SectionCard>
      )}

      <div className="mt-8 text-center">
        <button onClick={() => router.push("/docs/positions/GMP")} className={getToolbarActionClassName("secondary")}>← 返回列表</button>
      </div>
    </PageContent>
  );
}
