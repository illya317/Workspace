"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionButton, DataTable, EmptyStateCard, SectionCard } from "@workspace/core/ui";
import type { DataTableColumn } from "@workspace/core/ui";
import { DatabasePageFrame } from "@workspace/core/ui";

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
    fetch(workspacePath(`/api/modules/hr/position-descriptions?code=${encodeURIComponent(code)}`))
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { setPos(d.positionDescription); setLoading(false); })
      .catch(() => { setError("获取失败"); setLoading(false); });
  }, [code]);

  if (loading) {
    return (
      <DatabasePageFrame contentClassName="py-8">
        <EmptyStateCard compact={false}>加载中...</EmptyStateCard>
      </DatabasePageFrame>
    );
  }

  if (error || !pos) return (
    <DatabasePageFrame contentClassName="py-8">
      <EmptyStateCard compact={false}>
        <div className="space-y-4">
          <div>{error || "未找到"}</div>
        <ActionButton onClick={() => router.push("/docs/positions/GMP")} className="mt-4">
          返回列表
        </ActionButton>
      </div>
      </EmptyStateCard>
    </DatabasePageFrame>
  );

  const d = pos.details || {};
  const historyRows = Array.isArray(d.changeHistory) ? d.changeHistory as Record<string, unknown>[] : [];
  const historyColumns: DataTableColumn<Record<string, unknown>>[] = [
    { key: "version", label: "版本", required: true, render: (row) => <span className="text-slate-700">{String(row.version ?? "")}</span> },
    { key: "documentName", label: "文件名称", required: true, render: (row) => <span className="text-slate-700">{String(row.documentName ?? "")}</span> },
    { key: "effectiveDate", label: "生效日期", required: true, render: (row) => <span className="text-slate-700">{String(row.effectiveDate ?? "")}</span> },
  ];

  return (
    <DatabasePageFrame contentClassName="py-8">
      <SectionCard
        title="岗位说明书"
        className="mb-6"
        actions={<ActionButton onClick={() => router.push("/docs/positions/GMP")}>返回列表</ActionButton>}
      >
        <div className="text-sm text-gray-500">
          文件编号：{s(pos.code)} &nbsp;|&nbsp; 版本：{s(pos.version)} &nbsp;|&nbsp; 生效日期：{s(pos.effectiveDate)}
        </div>
      </SectionCard>

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

      <div className="mt-8 flex justify-end">
        <ActionButton onClick={() => router.push("/docs/positions/GMP")}>返回列表</ActionButton>
      </div>
    </DatabasePageFrame>
  );
}
