"use client";

import {
  PageSurface,
  createMessageSection,
  createPageBody,
  createPageDataSection,
  createSectionSection,
  type DataSurfaceCellSpec,
  type DataSurfaceStructuredCellSpec,
  type PageSurfaceTabBarSpec,
  type PageSurfaceToolbarSpec,
} from "@workspace/core/ui";
import type {
  PeriodDossierInitialGoal,
  PeriodDossierModel,
  PeriodDossierTask,
} from "@workspace/platform/period-dossier";

export function PeriodDossierPage({
  model,
  loading,
  navigation,
  toolbar,
  onBack,
}: {
  model: PeriodDossierModel | null;
  loading: boolean;
  navigation?: PageSurfaceTabBarSpec;
  toolbar?: PageSurfaceToolbarSpec;
  onBack: () => void;
}) {
  const body = loading
    ? createPageBody([createMessageSection("period-dossier-loading", { content: "正在加载贡献材料...", tone: "muted" })])
    : model
      ? dossierBody(model, onBack)
      : createPageBody([createMessageSection("period-dossier-empty", { content: "未找到该工作空间的周期贡献材料", tone: "muted" })]);
  return <PageSurface kind="standard" tabbar={navigation} toolbar={toolbar} body={body} />;
}

export type {
  PeriodDossierInitialGoal,
  PeriodDossierModel,
  PeriodDossierReportRow,
  PeriodDossierTask,
} from "@workspace/platform/period-dossier";

function dossierBody(model: PeriodDossierModel, onBack: () => void) {
  const subjectMeta = [model.subject.code, ...model.subject.meta.map((item) => item.value)].filter(Boolean).join(" · ");
  const sections = model.content.kind === "report"
    ? [reportSection(model, onBack)]
    : [initialGoalSection(model, subjectMeta, onBack)];
  return createPageBody(sections);
}

function reportSection(model: PeriodDossierModel, onBack: () => void) {
  if (model.content.kind !== "report") throw new Error("周期档案类型无效");
  const currentLabel = model.period.type === "monthly" ? "本月完成情况" : "本周完成情况";
  const nextLabel = model.period.type === "monthly" ? "下月计划" : "下周计划";
  const header = ["目标", currentLabel, nextLabel, "关键结果"].map(headerCell);
  const rows = model.content.rows.map((row) => [
    titleCell(row.objective),
    valueCell(taskList(row.current, true)),
    valueCell(taskList(row.next, false)),
    valueCell(textList(row.keyResults)),
  ]);
  return createSectionSection("period-dossier-report", {
    title: `${model.subject.name} · ${model.period.type === "monthly" ? "月度" : "周度"}工作汇报 · ${model.period.startDate} - ${model.period.endDate}${model.content.saved ? " · 已保存" : " · 未保存"}`,
    actions: [backCommand(onBack)],
    sections: [createPageDataSection("period-dossier-report-table", {
      kind: "structured",
      rows: rows.length ? [header, ...rows] : [[{ content: { kind: "empty", content: "当前周期暂无工作汇报" }, colSpan: 4, cellRole: "empty" }]],
      format: { kind: "matrix", columnWidths: ["12rem", null, null, "11rem"] },
      frame: "bordered",
      structuredScroll: true,
      scroll: { x: true },
      presentation: { density: "compact", header: "tinted", grid: "cells", stripe: "subtle", cellWrap: "wrap", controlHeight: "auto" },
    })],
  });
}

function initialGoalSection(model: PeriodDossierModel, subjectMeta: string, onBack: () => void) {
  if (model.content.kind !== "initial-goal") throw new Error("周期档案类型无效");
  const data = model.content.data;
  return createSectionSection("period-dossier-initial-goal", {
    title: `${model.subject.name} · ${model.period.label} · ${subjectMeta}`,
    actions: [backCommand(onBack)],
    sections: [
      createPageDataSection("period-dossier-routine", {
        kind: "structured",
        rows: tableRows(
          ["日常职责", "所属职责"],
          data.routine.map((row) => [textCell(row.title, true), textCell(row.responsibility)]),
          "暂无日常工作",
        ),
        frame: "bordered",
        presentation: { density: "compact", header: "tinted", grid: "cells", cellWrap: "wrap" },
      }),
      createPageDataSection("period-dossier-goals", {
        kind: "structured",
        rows: goalMatrixRows(data),
        frame: "bordered",
        structuredScroll: true,
        scroll: { x: true },
        presentation: { density: "compact", header: "tinted", grid: "cells", cellWrap: "wrap", controlHeight: "auto" },
      }),
      createPageDataSection("period-dossier-alignments", {
        kind: "structured",
        rows: tableRows(
          ["承接类型", "承接事项", "来源", "计划起止"],
          data.alignments.map((row) => [textCell(row.group), textCell(row.title, true), textCell(row.source), textCell(row.dateRange)]),
          "暂无承接任务",
        ),
        frame: "bordered",
        presentation: { density: "compact", header: "tinted", grid: "cells", cellWrap: "wrap" },
      }),
    ],
  });
}

function goalMatrixRows(data: PeriodDossierInitialGoal): DataSurfaceStructuredCellSpec[][] {
  const header = [headerCell("周期目标 / KR"), ...data.columns.map((column) => headerCell(`${column.label}\n${column.startDate} - ${column.endDate}`))];
  if (!data.objectives.length) return [[{ content: { kind: "empty", content: "当前周期暂无任务目标" }, colSpan: Math.max(1, header.length), cellRole: "empty" }]];
  return [header, ...data.objectives.map((row) => [
    valueCell({ kind: "group", direction: "column", items: [
      { kind: "badge", label: row.kindLabel || "目标", tone: "green" },
      { kind: "text", value: row.title, emphasis: "strong", wrap: "wrap" },
    ] }),
    ...data.columns.map((column) => valueCell(textList(row.cells[column.key] ?? []))),
  ])];
}

function taskList(tasks: PeriodDossierTask[], showActual: boolean): DataSurfaceCellSpec {
  if (!tasks.length) return { kind: "empty", content: "无" };
  return { kind: "group", direction: "column", items: tasks.map((task) => ({
    kind: "group",
    direction: "column",
    items: [
      { kind: "text", value: task.title, emphasis: "strong", wrap: "wrap" },
      { kind: "badge", label: `计划完成：${task.plannedEndDate || "未设置"}`, tone: "slate" },
      ...(showActual ? [{ kind: "badge" as const, label: `实际完成：${task.actualEndDate || "未填写"}`, tone: task.actualEndDate ? "green" as const : "amber" as const }] : []),
    ],
  })) };
}

function textList(items: string[]): DataSurfaceCellSpec {
  return items.length
    ? { kind: "group", direction: "column", items: items.map((value) => ({ kind: "text", value, wrap: "wrap" })) }
    : { kind: "empty", content: "—" };
}

function tableRows(headers: string[], rows: DataSurfaceStructuredCellSpec[][], empty: string): DataSurfaceStructuredCellSpec[][] {
  return rows.length ? [headers.map(headerCell), ...rows] : [[{ content: { kind: "empty" as const, content: empty }, colSpan: headers.length, cellRole: "empty" }]];
}

function backCommand(onBack: () => void) {
  return { key: "back-to-contribution-list", label: "返回列表", icon: "back" as const, onClick: onBack };
}

function headerCell(value: string): DataSurfaceStructuredCellSpec {
  return { content: { kind: "text", value, wrap: "wrap" }, header: true, cellRole: "header" };
}

function titleCell(value: string): DataSurfaceStructuredCellSpec {
  return { content: { kind: "text", value, emphasis: "strong", wrap: "wrap" }, cellRole: "title" };
}

function textCell(value: string, strong = false): DataSurfaceStructuredCellSpec {
  return { content: value ? { kind: "text", value, emphasis: strong ? "strong" : undefined, wrap: "wrap" } : { kind: "empty" } };
}

function valueCell(content: DataSurfaceCellSpec): DataSurfaceStructuredCellSpec {
  return { content, cellRole: "value", rowHeight: "lg" };
}
