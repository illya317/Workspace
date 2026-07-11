import {
  PageSurface,
  createFieldsSection,
  createMessageSection,
  createMetricsSection,
  createPageBody,
  createPageDataSection,
  type DataSurfaceCellSpec,
  type DataSurfaceStructuredCellSpec,
  type DataSurfaceStructuredRowInteractionSpec,
  type FormSurfaceItemSpec,
  type PageSurfaceTabBarSpec,
  type SurfaceToolbarItems,
} from "@workspace/core/ui";
import type {
  AttendanceRow,
  DashboardData,
  DepartmentContributionRow,
  PerfTab,
  PerformanceAudience,
  ProjectContributionRow,
  ReviewDraft,
  ReviewRow,
  SubmissionAction,
  SubmissionRow,
} from "./performance-types";

const statusLabel: Record<string, string> = {
  draft: "草稿",
  submitted: "审批中",
  withdrawn: "已撤回",
  rejected: "已驳回",
  approved: "已归档",
  cancelled: "已取消",
  committing: "归档中",
};

export const EMPTY_REVIEW_DRAFT: ReviewDraft = {
  selfScore: "",
  selfComment: "",
  managerScore: "",
  managerComment: "",
  finalScore: "",
  finalGrade: "",
  hrComment: "",
  comment: "",
};

export function HrPerformanceView(input: {
  navigation: PageSurfaceTabBarSpec;
  activeTab: PerfTab;
  audience: PerformanceAudience;
  toolbarItems: SurfaceToolbarItems;
  data: DashboardData | null;
  loading: boolean;
  saving: boolean;
  canCreateSelfReview: boolean;
  selectedSubmissionId: number | null;
  draft: ReviewDraft;
  onDraftChange: (draft: ReviewDraft) => void;
  onCreateReview: () => void;
  onSaveReview: () => void;
  onSelectSubmission: (id: number) => void;
  onOpenContribution: (type: PerformanceAudience, id: number) => void;
  onSubmissionAction: (row: SubmissionRow, action: SubmissionAction) => void;
  onToolbarSubmit: () => void;
}) {
  const metricsSection = createMetricsSection("performance-metrics", {
    metrics: [
      { key: "active", label: "在职员工", value: input.data?.metrics.activeEmployeeCount ?? 0 },
      { key: "contributions", label: "贡献材料", value: input.data?.metrics.contributionCount ?? 0 },
      { key: "flows", label: "审批中", value: input.data?.metrics.submittedFlowCount ?? 0 },
      { key: "reviews", label: "已归档绩效", value: input.data?.metrics.reviewCount ?? 0 },
    ],
  });

  const body = createPageBody([
    metricsSection,
    ...(input.loading
      ? [createMessageSection("loading", { content: "正在加载绩效数据...", tone: "muted" as const })]
      : input.activeTab === "attendance"
        ? [structuredTableSection("attendance-table", attendanceHeaders, input.data?.attendanceRows ?? [], attendanceCells, "暂无考勤口径数据")]
        : input.activeTab === "works"
          ? [contributionDirectorySection(input.audience, input.data, input.onOpenContribution)]
          : [
            createFieldsSection("review-form", reviewFormItems(input.draft, input.onDraftChange), {
              layout: { columns: 4 },
              actions: [
                { key: "create-review", action: "create", label: "新建自评", disabled: input.saving || !input.canCreateSelfReview, onClick: input.onCreateReview },
                { key: "save-stage", action: "save", label: "保存评分", disabled: input.saving || !input.selectedSubmissionId, onClick: input.onSaveReview },
              ],
            }),
            structuredTableSection(
              "submissions-table",
              submissionHeaders,
              input.data?.submissionRows ?? [],
              (row) => submissionCells(row, input),
              "暂无绩效流程",
            ),
            structuredTableSection("reviews-table", reviewHeaders, input.data?.reviewRows ?? [], reviewCells, "暂无正式绩效记录"),
          ]),
  ]);

  return (
    <PageSurface
      kind="standard"
      tabbar={input.navigation}
      toolbar={{ items: input.toolbarItems, onSubmit: input.onToolbarSubmit }}
      body={body}
    />
  );
}

export function scoreValue(value: string) {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

const attendanceHeaders = ["工号", "姓名", "公司", "部门", "岗位", "考勤类型", "人员类型", "状态"];
const submissionHeaders = ["流程", "状态", "自评分", "上级分", "最终分", "等级", "当前节点", "更新时间", "动作"];
const reviewHeaders = ["工号", "员工", "自评分", "上级分", "最终分", "等级", "归档时间"];

function attendanceCells(row: AttendanceRow) {
  return [textCell(row.employeeId), textCell(row.name), textCell(row.company), textCell(row.department), textCell(row.position), textCell(row.attendanceType), textCell(row.personnelType), textCell(row.status)];
}

function contributionDirectorySection(
  audience: PerformanceAudience,
  data: DashboardData | null,
  onOpen: (type: PerformanceAudience, id: number) => void,
) {
  if (audience === "department") return contributionDepartmentSection(data?.contributionDirectories?.department ?? [], onOpen);
  if (audience === "project") return contributionProjectSection(data?.contributionDirectories?.project ?? [], onOpen);
  return contributionEmployeeSection(data?.attendanceRows ?? [], onOpen);
}

function contributionEmployeeSection(rows: AttendanceRow[], onOpen: (type: PerformanceAudience, id: number) => void) {
  return structuredTableSection(
    "contribution-employees",
    ["工号", "姓名", "公司", "部门", "岗位", "人员类型", "状态"],
    rows,
    (row) => [
      textCell(row.employeeId),
      textCell(row.name),
      textCell(row.company),
      textCell(row.department),
      textCell(row.position),
      textCell(row.personnelType),
      textCell(row.status),
    ],
    "当前范围暂无员工",
    (row) => ({ onClick: () => onOpen("personal", row.id), ariaLabel: `查看 ${row.name} 的贡献材料` }),
  );
}

function contributionDepartmentSection(rows: DepartmentContributionRow[], onOpen: (type: PerformanceAudience, id: number) => void) {
  return structuredTableSection(
    "contribution-departments",
    ["部门编码", "部门", "层级", "上级组织", "状态"],
    rows,
    (row) => [
      textCell(row.code),
      textCell(row.name),
      textCell(row.hierarchy),
      textCell(row.parentName),
      textCell(row.status),
    ],
    "当前范围暂无部门空间",
    (row) => ({ onClick: () => onOpen("department", row.id), ariaLabel: `查看 ${row.name} 部门空间的贡献材料` }),
  );
}

function contributionProjectSection(rows: ProjectContributionRow[], onOpen: (type: PerformanceAudience, id: number) => void) {
  return structuredTableSection(
    "contribution-projects",
    ["项目编码", "项目", "项目类型", "项目级别", "牵头部门", "状态"],
    rows,
    (row) => [
      textCell(row.code),
      textCell(row.name),
      textCell(row.projectType),
      textCell(row.projectLevel),
      textCell(row.leadingDepartment),
      textCell(row.status),
    ],
    "当前范围暂无项目空间",
    (row) => ({ onClick: () => onOpen("project", row.id), ariaLabel: `查看 ${row.name} 项目空间的贡献材料` }),
  );
}

function reviewCells(row: ReviewRow) {
  return [textCell(row.employeeCode), textCell(row.employeeName), numberCell(row.selfScore), numberCell(row.managerScore), numberCell(row.finalScore), gradeCell(row.finalGrade), textCell(formatDate(row.archivedAt))];
}

function submissionCells(
  row: SubmissionRow,
  input: Pick<Parameters<typeof HrPerformanceView>[0], "saving" | "selectedSubmissionId" | "onSelectSubmission" | "onSubmissionAction">,
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
    actionsCell([
      { key: "select", label: input.selectedSubmissionId === row.id ? "已选" : "选择", icon: "edit", disabled: input.saving, onClick: () => input.onSelectSubmission(row.id) },
      { key: "submit", label: "提交", icon: "send", disabled: input.saving || !["draft", "withdrawn", "rejected"].includes(row.status), onClick: () => input.onSubmissionAction(row, "submit") },
      { key: "withdraw", label: "撤回", icon: "withdraw", disabled: input.saving || row.status !== "submitted", onClick: () => input.onSubmissionAction(row, "withdraw") },
      { key: "approve", label: "通过", icon: "approve", disabled: input.saving || row.status !== "submitted" || !row.canProcess, onClick: () => input.onSubmissionAction(row, "approve") },
      { key: "reject", label: "驳回", icon: "reject", disabled: input.saving || row.status !== "submitted" || !row.canProcess, onClick: () => input.onSubmissionAction(row, "reject") },
      { key: "cancel", label: "取消", icon: "cancel", disabled: input.saving || !["draft", "withdrawn"].includes(row.status), onClick: () => input.onSubmissionAction(row, "cancel") },
    ]),
  ];
}

function reviewFormItems(draft: ReviewDraft, onChange: (next: ReviewDraft) => void): FormSurfaceItemSpec[] {
  const update = (key: keyof ReviewDraft, value: unknown) => onChange({ ...draft, [key]: String(value || "") });
  return [
    { key: "selfScore", label: "自评分", spec: { control: "number", valueType: "number", validation: { min: 0, max: 100 } }, value: draft.selfScore, onChange: (value: unknown) => update("selfScore", value) },
    { key: "managerScore", label: "上级评分", spec: { control: "number", valueType: "number", validation: { min: 0, max: 100 } }, value: draft.managerScore, onChange: (value: unknown) => update("managerScore", value) },
    { key: "finalScore", label: "HR 最终分", spec: { control: "number", valueType: "number", validation: { min: 0, max: 100 } }, value: draft.finalScore, onChange: (value: unknown) => update("finalScore", value) },
    { key: "finalGrade", label: "最终等级", spec: { control: "choice", valueType: "string", options: { source: "static", items: ["S", "A", "B", "C", "D"].map((grade) => ({ value: grade, label: grade })) } }, value: draft.finalGrade, onChange: (value: unknown) => update("finalGrade", value) },
    { key: "selfComment", label: "自评", spec: { control: "text", valueType: "string", multiline: true }, value: draft.selfComment, rows: 4, resize: "vertical", onChange: (value: unknown) => update("selfComment", value), span: 2 },
    { key: "managerComment", label: "上级评语", spec: { control: "text", valueType: "string", multiline: true }, value: draft.managerComment, rows: 4, resize: "vertical", onChange: (value: unknown) => update("managerComment", value), span: 2 },
    { key: "hrComment", label: "HR 评语", spec: { control: "text", valueType: "string", multiline: true }, value: draft.hrComment, rows: 4, resize: "vertical", onChange: (value: unknown) => update("hrComment", value), span: 2 },
    { key: "comment", label: "流程备注", spec: { control: "text", valueType: "string", multiline: true }, value: draft.comment, rows: 4, resize: "vertical", onChange: (value: unknown) => update("comment", value), span: 2 },
  ];
}

function formatDate(value: string) {
  return value ? value.slice(0, 10) : "-";
}

function textCell(value: unknown): DataSurfaceStructuredCellSpec {
  const text = String(value ?? "").trim();
  return { content: { kind: "text", value: text || "-" } };
}

function numberCell(value: number | null): DataSurfaceStructuredCellSpec {
  return { content: { kind: "number", value, empty: "-" }, align: "right" };
}

function gradeCell(grade: string): DataSurfaceStructuredCellSpec {
  const tone = grade === "S" || grade === "A" ? "green" : grade === "D" ? "red" : grade === "C" ? "orange" : "blue";
  return { content: grade ? { kind: "badge", label: grade, tone } : { kind: "empty" } };
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
  return { content: { kind: "text", value: activeWorkflowNodeKey === "hr-final-review" ? "HR 终评" : activeWorkflowNodeKey ? "直属上级" : "-" } };
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
  rowInteraction?: (row: T) => DataSurfaceStructuredRowInteractionSpec,
) {
  const headerRows: DataSurfaceStructuredCellSpec[][] = rows.length
    ? [headers.map((label) => ({ content: { kind: "text" as const, value: label }, header: true, emphasis: "strong" }))]
    : [];
  return createPageDataSection(key, {
    kind: "structured",
    rows: [...headerRows, ...rows.map(toCells)],
    rowInteractions: rowInteraction && rows.length ? [null, ...rows.map(rowInteraction)] : undefined,
    empty: emptyText,
    frame: "bordered",
    presentation: { density: "compact", header: "tinted" },
    scroll: { x: true },
  });
}
