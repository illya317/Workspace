"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import {
  PageSurface,
  createFieldsSection,
  createInlineFieldsSection,
  createMessageSection,
  createMetricsSection,
  createPageBody,
  createPageDataSection,
  createPageTabBar,
  useFeedback,
  type DataSurfaceCellSpec,
  type DataSurfaceStructuredCellSpec,
  type FormSurfaceItemSpec,
} from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import { getPageViewTabs } from "@workspace/platform/view-registry";
import type {
  AttendanceRow,
  ContributionRow,
  DashboardData,
  PerfTab,
  ReviewDraft,
  ReviewEditorStage,
  ReviewRow,
  SubmissionAction,
  SubmissionRow,
} from "./performance-types";
import { performanceSubmissionRowActions } from "./performance-review-editor-model";
import { usePerformanceReviewEditor } from "./use-performance-review-editor";

const tabs = getPageViewTabs("/work/performance") as { key: PerfTab; label: string }[];
const statusLabel: Record<string, string> = {
  draft: "草稿",
  submitted: "审批中",
  withdrawn: "已撤回",
  rejected: "已驳回",
  approved: "已归档",
  cancelled: "已取消",
  committing: "归档中",
};

export default function EmployeePerformanceClient({ user: _user }: { user: SessionUser; hideShell?: boolean }) {
  const [activeTab, setActiveTab] = useState<PerfTab>("attendance");
  const [data, setData] = useState<DashboardData | null>(null);
  const [cycleId, setCycleId] = useState<string>("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const feedback = useFeedback();

  const loadData = useCallback(async (nextCycleId = cycleId, nextKeyword = keyword) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (nextCycleId) params.set("cycleId", nextCycleId);
    if (nextKeyword.trim()) params.set("keyword", nextKeyword.trim());
    const response = await fetch(workspacePath(`/api/modules/hr/performance?${params.toString()}`));
    if (!response.ok) {
      const error = await readError(response);
      setData(null);
      feedback.error(error || "绩效工作台加载失败");
      setLoading(false);
      return;
    }
    const nextData = await response.json() as DashboardData;
    setData(nextData);
    if (!nextCycleId && nextData.activeCycleId) setCycleId(String(nextData.activeCycleId));
    setLoading(false);
  }, [cycleId, feedback, keyword]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const cycleOptions = data?.cycleOptions ?? [];
  const selectedCycleId = Number(cycleId || data?.activeCycleId || 0);
  const reloadPerformance = useCallback(() => loadData(cycleId, keyword), [cycleId, keyword, loadData]);
  const editor = usePerformanceReviewEditor({ data, selectedCycleId, reload: reloadPerformance });
  const contributionCounts = useMemo(() => countContributionRoles(data?.contributionRows ?? []), [data?.contributionRows]);

  const filterSection = createInlineFieldsSection("performance-filters", [
    {
      key: "cycleId",
      label: "周期",
      spec: {
        control: "choice",
        valueType: "string",
        options: { source: "static", items: cycleOptions.map((cycle) => ({ value: String(cycle.id), label: cycle.label || cycle.code })) },
      },
      value: cycleId,
      onChange: (value: unknown) => setCycleId(String(value || "")),
    },
    {
      key: "keyword",
      label: "搜索",
      spec: { control: "text", valueType: "string" },
      value: keyword,
      onChange: (value: unknown) => setKeyword(String(value || "")),
    },
  ], {
    commands: [
      { key: "search", label: "刷新", icon: "refresh", variant: "primary", disabled: loading, onClick: () => void loadData(cycleId, keyword) },
    ],
  });

  const metricsSection = createMetricsSection("performance-metrics", {
    metrics: [
      { key: "active", label: "在职员工", value: data?.metrics.activeEmployeeCount ?? 0 },
      { key: "contributions", label: "贡献材料", value: data?.metrics.contributionCount ?? 0 },
      { key: "flows", label: "审批中", value: data?.metrics.submittedFlowCount ?? 0 },
      { key: "reviews", label: "已归档绩效", value: data?.metrics.reviewCount ?? 0 },
    ],
  });

  const body = createPageBody([
    filterSection,
    metricsSection,
    ...(loading
      ? [createMessageSection("loading", { content: "正在加载绩效数据...", tone: "muted" as const })]
      : activeTab === "attendance"
        ? [structuredTableSection("attendance-table", attendanceHeaders, data?.attendanceRows ?? [], attendanceCells, "暂无考勤口径数据")]
        : activeTab === "works"
          ? [
            createMetricsSection("work-kind-metrics", {
              metrics: [
                { key: "owner", label: "Owner", value: contributionCounts.owner },
                { key: "participant", label: "参与", value: contributionCounts.participant },
                { key: "project", label: "项目结构", value: contributionCounts.project },
              ],
            }),
            structuredTableSection("contribution-table", contributionHeaders, data?.contributionRows ?? [], contributionCells, "当前周期暂无贡献材料"),
          ]
          : [
            createFieldsSection("review-form", reviewFormItems(editor.draft, editor.setDraft, editor.editorFieldsDisabled, editor.editorStage), {
              layout: { columns: 4 },
              actions: editor.editorOpen
                ? editor.editorActions
                : editor.showCreateSelfReview
                  ? [{ key: "create-review", action: "create", label: "新建自评", disabled: editor.saving || !editor.canCreateSelfReview, onClick: editor.beginCreate }]
                  : [],
            }),
            structuredTableSection("submissions-table", submissionHeaders, data?.submissionRows ?? [], (row) => submissionCells(row, editor.beginEdit, editor.runRowAction, editor.saving, editor.selectedSubmissionId), "暂无绩效流程"),
            structuredTableSection("reviews-table", reviewHeaders, data?.reviewRows ?? [], reviewCells, "暂无正式绩效记录"),
          ]),
  ]);

  return (
    <PageSurface
      kind="standard"
      tabbar={createPageTabBar({
        items: tabs,
        active: activeTab,
        onChange: (key: string) => setActiveTab(key as PerfTab),
      })}
      body={body}
    />
  );
}

const attendanceHeaders = ["工号", "姓名", "公司", "部门", "岗位", "考勤类型", "人员类型", "状态"];
const contributionHeaders = ["员工", "来源空间", "贡献类型", "事项", "关联目标/项目", "角色", "状态", "截止", "证据", "关联项"];
const submissionHeaders = ["流程", "状态", "自评分", "上级分", "最终分", "等级", "当前节点", "更新时间", "动作"];
const reviewHeaders = ["工号", "员工", "自评分", "上级分", "最终分", "等级", "归档时间"];

function attendanceCells(row: AttendanceRow) {
  return [textCell(row.employeeId), textCell(row.name), textCell(row.company), textCell(row.department), textCell(row.position), textCell(row.attendanceType), textCell(row.personnelType), textCell(row.status)];
}

function contributionCells(row: ContributionRow) {
  return [
    textCell(row.employeeName),
    textCell(row.sourceSpace),
    textCell(row.contributionType),
    textCell(row.title),
    textCell(row.relation),
    badgeCell(row.roleLabel, roleTone(row.contributionRole)),
    textCell(row.status),
    textCell(formatDate(row.actualEndDate || "")),
    numberCell(row.evidenceCount),
    textCell(row.referenceLabel),
  ];
}

function countContributionRoles(rows: ContributionRow[]) {
  return rows.reduce((counts, row) => {
    if (row.contributionRole === "owner") counts.owner += 1;
    else if (row.contributionRole === "participant") counts.participant += 1;
    else counts.project += 1;
    return counts;
  }, { owner: 0, participant: 0, project: 0 });
}

function reviewCells(row: ReviewRow) {
  return [textCell(row.employeeCode), textCell(row.employeeName), numberCell(row.selfScore), numberCell(row.managerScore), numberCell(row.finalScore), gradeCell(row.finalGrade), textCell(formatDate(row.archivedAt))];
}

function submissionCells(
  row: SubmissionRow,
  onEdit: (id: number) => void,
  onAction: (row: SubmissionRow, action: SubmissionAction) => void,
  saving: boolean,
  selectedId: number | null,
) {
  return [
    textCell(`#${row.id}`),
    statusCell(row.status),
    numberCell(row.selfScore),
    numberCell(row.managerScore),
    numberCell(row.finalScore),
    textCell(row.finalGrade),
    workflowNodeCell(row.activeWorkflowNodeKey),
    textCell(formatDate(row.updatedAt)),
    actionsCell(performanceSubmissionRowActions({ row, selectedId, saving, onEdit, onAction })),
  ];
}

function reviewFormItems(
  draft: ReviewDraft,
  setDraft: (next: ReviewDraft) => void,
  disabled: boolean,
  stage: ReviewEditorStage,
): FormSurfaceItemSpec[] {
  const update = (key: keyof ReviewDraft, value: unknown) => setDraft({ ...draft, [key]: String(value || "") });
  const selfDisabled = disabled || stage !== "self";
  const managerDisabled = disabled || stage !== "manager";
  const hrDisabled = disabled || stage !== "hr";
  return [
    { key: "selfScore", label: "自评分", spec: { control: "number", valueType: "number", validation: { min: 0, max: 100 } }, value: draft.selfScore, disabled: selfDisabled, onChange: (value: unknown) => update("selfScore", value) },
    { key: "managerScore", label: "上级评分", spec: { control: "number", valueType: "number", validation: { min: 0, max: 100 } }, value: draft.managerScore, disabled: managerDisabled, onChange: (value: unknown) => update("managerScore", value) },
    { key: "finalScore", label: "HR 最终分", spec: { control: "number", valueType: "number", validation: { min: 0, max: 100 } }, value: draft.finalScore, disabled: hrDisabled, onChange: (value: unknown) => update("finalScore", value) },
    { key: "finalGrade", label: "最终等级", spec: { control: "choice", valueType: "string", options: { source: "static", items: ["S", "A", "B", "C", "D"].map((grade) => ({ value: grade, label: grade })) } }, value: draft.finalGrade, disabled: hrDisabled, onChange: (value: unknown) => update("finalGrade", value) },
    { key: "selfComment", label: "自评", spec: { control: "text", valueType: "string", multiline: true }, value: draft.selfComment, disabled: selfDisabled, rows: 4, resize: "vertical", onChange: (value: unknown) => update("selfComment", value), span: 2 },
    { key: "managerComment", label: "上级评语", spec: { control: "text", valueType: "string", multiline: true }, value: draft.managerComment, disabled: managerDisabled, rows: 4, resize: "vertical", onChange: (value: unknown) => update("managerComment", value), span: 2 },
    { key: "hrComment", label: "HR 评语", spec: { control: "text", valueType: "string", multiline: true }, value: draft.hrComment, disabled: hrDisabled, rows: 4, resize: "vertical", onChange: (value: unknown) => update("hrComment", value), span: 2 },
    { key: "comment", label: "流程备注", spec: { control: "text", valueType: "string", multiline: true }, value: draft.comment, disabled, rows: 4, resize: "vertical", onChange: (value: unknown) => update("comment", value), span: 2 },
  ];
}

function formatDate(value: string) {
  if (!value) return "-";
  return value.slice(0, 10);
}

function gradeTone(grade: string) {
  if (grade === "S" || grade === "A") return "green" as const;
  if (grade === "D") return "red" as const;
  if (grade === "C") return "orange" as const;
  return "blue" as const;
}

async function readError(response: Response) {
  const fallback = `请求失败 (${response.status})`;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    try {
      const text = await response.text();
      const compact = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      return compact ? `${compact.slice(0, 120)} (${response.status})` : fallback;
    } catch {
      return fallback;
    }
  }
  try {
    const json = await response.json();
    return String(json.error || json.message || fallback);
  } catch {
    return fallback;
  }
}

function cellText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || "-";
}

function textCell(value: unknown): DataSurfaceStructuredCellSpec {
  return { content: { kind: "text", value: cellText(value) } };
}

function numberCell(value: number | null): DataSurfaceStructuredCellSpec {
  return { content: { kind: "number", value, empty: "-" }, align: "right" };
}

function gradeCell(grade: string): DataSurfaceStructuredCellSpec {
  return { content: grade ? { kind: "badge", label: grade, tone: gradeTone(grade) } : { kind: "empty" } };
}

function badgeCell(label: string, tone: ReturnType<typeof roleTone>): DataSurfaceStructuredCellSpec {
  return { content: label ? { kind: "badge", label, tone } : { kind: "empty" } };
}

function roleTone(role: ContributionRow["contributionRole"]) {
  if (role === "owner") return "green" as const;
  return "gray" as const;
}

function statusCell(status: string): DataSurfaceStructuredCellSpec {
  return {
    content: {
      kind: "badge",
      label: statusLabel[status] || status,
      tone: status === "submitted" ? "blue" : status === "approved" ? "green" : status === "rejected" ? "red" : "gray",
    },
  };
}

function workflowNodeCell(activeWorkflowNodeKey: string | null): DataSurfaceStructuredCellSpec {
  return {
    content: {
      kind: "text",
      value: activeWorkflowNodeKey === "hr-final-review" ? "HR 终评" : activeWorkflowNodeKey ? "直属上级" : "-",
    },
  };
}

function actionsCell(actions: Extract<DataSurfaceCellSpec, { kind: "actions" }>["actions"]): DataSurfaceStructuredCellSpec {
  return { content: { kind: "actions", actions } };
}

function structuredTableSection<T>(
  key: string,
  headers: string[],
  rows: T[],
  toCells: (row: T) => DataSurfaceStructuredCellSpec[],
  emptyText: string,
) {
  const headerRows: DataSurfaceStructuredCellSpec[][] = rows.length
    ? [headers.map((label) => ({ content: { kind: "text" as const, value: label }, header: true, emphasis: "strong" }))]
    : [];
  return createPageDataSection(key, {
    kind: "structured",
    rows: [...headerRows, ...rows.map(toCells)],
    empty: emptyText,
    frame: "bordered",
    presentation: { density: "compact", header: "tinted" },
    scroll: { x: true },
  });
}
