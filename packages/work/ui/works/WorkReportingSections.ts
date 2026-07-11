import {
  type BodySurfaceSectionSpec,
  type DataSurfaceCellSpec,
  type DataSurfaceStructuredCellSpec,
} from "@workspace/core/ui";
import type { WorkReportDraftResponse, WorkReportItem } from "./types";
import type { ReportPeriodType } from "./WorkReportPeriods";
import type { PeriodDossierReportRow } from "@workspace/platform/period-dossier";

type WorkReportingSectionProps = {
  draft: WorkReportDraftResponse | null;
  periodType: ReportPeriodType;
  loading: boolean;
  canEdit: boolean;
  onUpdate: (index: number, patch: Partial<WorkReportItem>) => void;
};

type ReportingRow = WorkReportItem & { rowIndex: number };

type ObjectiveReportRow = Omit<PeriodDossierReportRow, "current" | "next"> & {
  current: ReportingRow[];
  next: ReportingRow[];
  sortOrder: number;
};

export function workReportingSection(props: WorkReportingSectionProps): BodySurfaceSectionSpec {
  const periodLabel = props.periodType === "monthly" ? "本月" : "本周";
  const nextPeriodLabel = props.periodType === "monthly" ? "下月" : "下周";
  const rows = (props.draft?.items ?? []).map((item, rowIndex) => ({ ...item, rowIndex }));
  const objectiveRows = aggregateObjectiveRows(rows);

  return {
    key: "work-reporting-snapshot",
    header: {
      title: props.periodType === "monthly" ? "月度工作汇报" : "周度工作汇报",
      badges: [
        { key: "period", label: `${props.draft?.period.periodStart ?? ""} - ${props.draft?.period.periodEnd ?? ""}`, tone: "muted" },
        { key: "status", label: props.draft?.report ? "已保存快照" : "待保存", tone: props.draft?.report ? "success" : "warning" },
      ],
    },
    body: {
      kind: "data",
      data: {
        kind: "structured",
        rows: reportingTableRows(objectiveRows, periodLabel, nextPeriodLabel, props.loading),
        format: { kind: "matrix", columnWidths: ["12rem", null, null, "11rem"] },
        frame: "bordered",
        structuredScroll: true,
        scroll: { x: true },
        presentation: {
          density: "compact",
          header: "tinted",
          grid: "cells",
          stripe: "subtle",
          cellWrap: "wrap",
          controlHeight: "auto",
        },
      },
    },
  };
}

function reportingTableRows(
  objectiveRows: ObjectiveReportRow[],
  periodLabel: string,
  nextPeriodLabel: string,
  loading: boolean,
): DataSurfaceStructuredCellSpec[][] {
  const header = [
    headerCell("目标"),
    headerCell(`${periodLabel}完成情况`),
    headerCell(`${nextPeriodLabel}计划`),
    headerCell("关键结果"),
  ];
  const rows = objectiveRows.map((row): DataSurfaceStructuredCellSpec[] => [
    titleCell(row.objective),
    valueCell(taskList(row.current, "current")),
    valueCell(taskList(row.next, "next")),
    valueCell(row.keyResults.length > 0 ? textList(row.keyResults) : emptyCell("")),
  ]);
  if (rows.length === 0 && !loading) {
    rows.push([{ content: emptyCell("当前周期暂无任务或日常职责"), cellRole: "empty", colSpan: 4 }]);
  }
  if (loading) {
    rows.push([{ content: emptyCell("正在整理工作计划..."), cellRole: "empty", colSpan: 4 }]);
  }
  return [header, ...rows];
}

function aggregateObjectiveRows(rows: ReportingRow[]) {
  const groups = new Map<string, ObjectiveReportRow>();
  for (const item of rows) {
    const kind = reportingKind(item);
    if (kind !== "routine" && kind !== "current" && kind !== "next") continue;
    const objective = kind === "routine"
      ? item.title.trim() || "未命名职责"
      : item.objectiveTitleSnapshot.trim() || "其他任务";
    const key = `${item.workPlanId ?? "none"}:${objective}`;
    const group = groups.get(key) ?? {
      id: key,
      objective,
      keyResults: [],
      current: [],
      next: [],
      sortOrder: item.sortOrder,
    };
    const keyResult = item.keyResultTitleSnapshot.trim();
    if (keyResult && !group.keyResults.includes(keyResult)) group.keyResults.push(keyResult);
    if (kind === "current" || kind === "next") group[kind].push(item);
    group.sortOrder = Math.min(group.sortOrder, item.sortOrder);
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) => left.sortOrder - right.sortOrder);
}

function taskList(items: ReportingRow[], period: "current" | "next"): DataSurfaceCellSpec {
  if (items.length === 0) return emptyCell("无");
  return {
    kind: "group",
    direction: "column",
    items: items.map((item) => taskBlock(item, period)),
  };
}

function taskBlock(item: ReportingRow, period: "current" | "next"): DataSurfaceCellSpec {
  const timeItems: DataSurfaceCellSpec[] = [
    { kind: "badge", label: `计划完成：${formatDate(item.snapshotPlannedEndDate)}`, tone: "slate" },
  ];
  if (period === "current") {
    if (item.snapshotActualEndDate) {
      timeItems.push({ kind: "badge", label: `实际完成：${formatDate(item.snapshotActualEndDate)}`, tone: "green" });
    } else {
      timeItems.push({ kind: "badge", label: "实际完成：未填写", tone: "amber" });
    }
  }
  return {
    kind: "group",
    direction: "column",
    items: [
      { kind: "text", value: item.title || "未命名任务", emphasis: "strong", wrap: "wrap" },
      ...(item.keyResultTitleSnapshot ? [{ kind: "text" as const, value: `关键结果：${item.keyResultTitleSnapshot}`, tone: "muted" as const, wrap: "wrap" as const }] : []),
      { kind: "group", direction: "column", items: timeItems },
    ],
  };
}

function headerCell(content: string): DataSurfaceStructuredCellSpec {
  return { content, header: true, cellRole: "header" };
}

function titleCell(content: string): DataSurfaceStructuredCellSpec {
  return { content: { kind: "text", value: content, emphasis: "strong", wrap: "wrap" }, cellRole: "title" };
}

function valueCell(content: DataSurfaceCellSpec): DataSurfaceStructuredCellSpec {
  return { content, cellRole: "value", rowHeight: "lg" };
}

function textList(items: string[]): DataSurfaceCellSpec {
  return {
    kind: "group",
    direction: "column",
    items: items.map((item) => ({ kind: "text", value: item, wrap: "wrap" })),
  };
}

function emptyCell(content: string): DataSurfaceCellSpec {
  return { kind: "empty", content };
}

function reportingKind(item: WorkReportItem) {
  if (item.reportItemKind === "current" || item.reportItemKind === "routine" || item.reportItemKind === "next") return item.reportItemKind;
  if (item.workPlanKind === "routine") return "routine";
  return "assessment";
}

function formatDate(value: string | null) {
  return value || "未设置";
}
