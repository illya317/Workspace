"use client";

import { createBlockSurfaceBlock, createMessageBlock, createSectionBlock, PageSurface, type DataSurfaceColumnSpec, type PageSurfaceBlockSpec, type PageSurfaceCommandSpec } from "@workspace/core/ui";

export interface PositionDescriptionReadOnlyData {
  id?: number | string;
  code: string;
  name: string;
  departmentName?: string | null;
  reportTo?: string | null;
  positionPurpose?: string | null;
  summary?: string | null;
  headcount?: number | null;
  version?: string | null;
  effectiveDate?: string | null;
  details?: Record<string, unknown> | null;
}

function s(val: unknown, fb = "—"): string {
  if (val === null || val === undefined || val === "") return fb;
  return String(val);
}

function Pair({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="mb-1.5 text-sm">
      <strong className="text-gray-700">{label}：</strong>
      <span className="text-gray-600">{String(value)}</span>
    </div>
  );
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

export function PositionDescriptionReadOnlyView({
  data,
  showHeader = true,
  actions,
}: {
  data: PositionDescriptionReadOnlyData;
  showHeader?: boolean;
  actions?: PageSurfaceCommandSpec[];
}) {
  const d = data.details || {};
  const historyRows = Array.isArray(d.changeHistory) ? (d.changeHistory as Record<string, unknown>[]) : [];
  const historyColumns: DataSurfaceColumnSpec<Record<string, unknown>>[] = [
    {
      key: "version",
      label: "版本",
      required: true,
      cell: (row) => <span className="text-slate-700">{String(row.version ?? "")}</span>,
    },
    {
      key: "documentName",
      label: "文件名称",
      required: true,
      cell: (row) => <span className="text-slate-700">{String(row.documentName ?? "")}</span>,
    },
    {
      key: "effectiveDate",
      label: "生效日期",
      required: true,
      cell: (row) => <span className="text-slate-700">{String(row.effectiveDate ?? "")}</span>,
    },
  ];
  const blocks: PageSurfaceBlockSpec[] = [
    ...(showHeader ? [createSectionBlock("header", {
      title: "岗位说明书",
      className: "mb-6",
      blocks: [createMessageBlock("header-meta", {
        className: "border-0 bg-transparent p-0 text-sm text-gray-500",
        content: (
          <>
            文件编号：{s(data.code)} &nbsp;|&nbsp; 版本：{s(data.version)} &nbsp;|&nbsp; 生效日期：{s(data.effectiveDate)}
          </>
        ),
      })],
    })] : []),
    createSectionBlock("basic", {
      title: "基本信息",
      className: "mb-6",
      blocks: [createBlockSurfaceBlock("basic-fields", {
        kind: "message",
        className: "border-0 bg-transparent p-0 text-inherit",
        content: (
          <>
            <Pair label="岗位名称" value={data.name} />
            <Pair label="所属部门" value={data.departmentName} />
            <Pair label="直接上级" value={data.reportTo} />
            {Array.isArray(d.subordinates) && d.subordinates.length > 0 ? (
              <div className="mb-1.5 text-sm">
                <strong className="text-gray-700">直接下级：</strong>
                {d.subordinates.map((name: string, i: number) => (
                  <span key={i}>
                    {i > 0 && "、"}
                    <span className="text-gray-600">{name}</span>
                  </span>
                ))}
              </div>
            ) : (
              <Pair label="直接下级" value={s(d.subordinates)} />
            )}
            <Pair label="编制人数" value={data.headcount} />
          </>
        )
      })],
    }),
    ...(data.positionPurpose || data.summary ? [createSectionBlock("overview", {
      title: "岗位概述",
      className: "mb-6",
      blocks: [createMessageBlock("overview-fields", {
        className: "border-0 bg-transparent p-0 text-inherit",
        content: (
          <>
            <Pair label="岗位目的" value={data.positionPurpose} />
            <Pair label="职责概要" value={data.summary} />
          </>
        ),
      })],
    })] : []),
    ...(Array.isArray(d.duties) && d.duties.length > 0 ? [createSectionBlock("duties", {
      title: "岗位职责",
      className: "mb-6",
      blocks: [createMessageBlock("duties-content", {
        className: "border-0 bg-transparent p-0 text-inherit",
        content: (
          <>
            {d.duties.map((duty: Record<string, unknown>, i: number) => (
              <div key={i} className="mb-4">
                <div className="mb-1 text-sm font-semibold text-gray-700">
                  {i + 1}. {s(duty.title)}
                </div>
                {Array.isArray(duty.items) && duty.items.length > 0 && (
                  <ul className="list-disc space-y-0.5 pl-8 text-sm text-gray-600">
                    {duty.items.map((item: string, j: number) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </>
        ),
      })],
    })] : []),
    ...(!!(d.education || formatMajorItems(d.major) || formatExperienceRequirements(d.experienceRequirements) || d.training) ? [createSectionBlock("qualification", {
      title: "任职资格",
      className: "mb-6",
      blocks: [createMessageBlock("qualification-fields", {
        className: "border-0 bg-transparent p-0 text-inherit",
        content: (
          <>
            <Pair label="教育水平" value={d.education} />
            <Pair label="专业要求" value={formatMajorItems(d.major)} />
            <Pair label="工作经验" value={formatExperienceRequirements(d.experienceRequirements)} />
            <Pair label="培训经历" value={d.training} />
          </>
        ),
      })],
    })] : []),
    ...(!!(formatWorkEnvironments(d.workEnvironments) || d.workSchedule) ? [createSectionBlock("conditions", {
      title: "工作条件",
      className: "mb-6",
      blocks: [createMessageBlock("conditions-fields", {
        className: "border-0 bg-transparent p-0 text-inherit",
        content: (
          <>
            <Pair label="工作环境" value={formatWorkEnvironments(d.workEnvironments)} />
            <Pair label="工作时间" value={d.workSchedule} />
          </>
        ),
      })],
    })] : []),
    ...(historyRows.length > 0 ? [createSectionBlock("history", {
      title: "变更历史",
      bodyClassName: "overflow-x-auto p-0",
      className: "mb-6",
      blocks: [{
        kind: "data" as const,
        key: "history-table",
        surface: {
          kind: "table" as const,
          rows: historyRows,
          columns: historyColumns,
          visibleColumns: [],
          density: "compact" as const,
          rowKey: (row: Record<string, unknown>) => `${String(row.version ?? "")}:${String(row.documentName ?? "")}:${String(row.effectiveDate ?? "")}`,
        },
      }],
    })] : []),
  ];

  return (
    <PageSurface
      kind="detail"
      actions={actions}
      blocks={blocks}
    />
  );
}
