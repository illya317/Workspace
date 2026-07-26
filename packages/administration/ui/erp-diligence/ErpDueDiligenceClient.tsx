"use client";

import {
  calculateErpDiligenceOpportunity,
  calculateErpDiligenceCompletion,
  ERP_DILIGENCE_AREA_OPTIONS,
  ERP_DILIGENCE_QUESTION_COUNT,
  ERP_DILIGENCE_QUESTION_KEYS,
  ERP_DILIGENCE_QUESTION_SECTIONS,
  ERP_DILIGENCE_TABS,
} from "@workspace/administration/constants";
import type {
  ErpDiligenceDraft,
  ErpDiligenceEvidenceAttachment,
  ErpDiligenceSubmissionDto,
} from "@workspace/administration/types";
import { workspacePath } from "@workspace/core/routing";
import {
  createFieldsSection,
  createMessageSection,
  createMetricsSection,
  createPageBody,
  createPageTableSection,
  createPageTabBar,
  createPanelSection,
  type BodySurfaceSectionSpec,
  type DataSurfaceColumnSpec,
  type FormSurfaceActionSpec,
  PageSurface,
  useFeedback,
} from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import { useMemo, useState } from "react";
import { evidenceItems, processItems, profileItems, questionItems } from "./erp-diligence-form";
import { useErpDiligence } from "./useErpDiligence";

type DiligenceTab = "profile" | "process" | "commercial" | "fulfillment" | "finance" | "systems" | "summary" | "review";

const AREA_LABELS: Record<string, string> = Object.fromEntries(
  ERP_DILIGENCE_AREA_OPTIONS.map((option) => [option.value, option.label]),
);

function formatDateTime(value: string | null) {
  if (!value) return "尚未提交";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function reviewColumns(): DataSurfaceColumnSpec<ErpDiligenceSubmissionDto>[] {
  return [
    { key: "respondent", label: "填报人", defaultVisible: true, cell: (row) => ({ kind: "text", value: row.respondentName, emphasis: "medium" }) },
    { key: "department", label: "部门/岗位", defaultVisible: true, cell: (row) => ({ kind: "stack", items: [row.departmentName || "未填写", { kind: "text", value: row.roleTitle || "未填写", tone: "muted" }] }) },
    { key: "area", label: "主要环节", defaultVisible: true, cell: (row) => AREA_LABELS[row.primaryArea] || row.primaryArea || "未选择" },
    { key: "completion", label: "完成度", defaultVisible: true, align: "right", cell: (row) => `${row.completionPercent}%` },
    { key: "status", label: "状态", defaultVisible: true, cell: (row) => ({ kind: "badge", label: row.status === "submitted" ? "已提交" : "草稿", tone: row.status === "submitted" ? "green" : "slate" }) },
    { key: "updatedAt", label: "最近更新", defaultVisible: true, cell: (row) => formatDateTime(row.updatedAt) },
  ];
}

function metrics(draft: ErpDiligenceDraft) {
  const answered = ERP_DILIGENCE_QUESTION_KEYS.filter((key) => {
    const answer = draft.answers[key];
    return Array.isArray(answer) ? answer.length > 0 : Boolean(answer?.trim());
  }).length;
  const opportunityScores = draft.processSteps.map(calculateErpDiligenceOpportunity);
  return createMetricsSection("diligence-metrics", {
    metrics: [
      { key: "completion", label: "整体完成度", value: `${calculateErpDiligenceCompletion(draft)}%` },
      { key: "answers", label: "已回答问题", value: `${answered} / ${ERP_DILIGENCE_QUESTION_COUNT}` },
      { key: "digitization", label: "高数字化潜力", value: opportunityScores.filter((score) => score.digitizationScore >= 65).length },
      { key: "agent", label: "高 Agent 潜力", value: opportunityScores.filter((score) => score.agentScore >= 60).length },
      { key: "evidence", label: "材料线索", value: draft.evidenceItems.length },
    ],
  });
}

function readOnlySubmissionSections(
  submission: ErpDiligenceSubmissionDto,
  onDownloadAttachment: (attachment: ErpDiligenceEvidenceAttachment) => void,
): BodySurfaceSectionSpec[] {
  const noop = () => undefined;
  return [
    createMessageSection("review-status", { tone: submission.status === "submitted" ? "success" : "muted", content: `${submission.respondentName} · ${submission.status === "submitted" ? `提交于 ${formatDateTime(submission.submittedAt)}` : "仍为草稿"} · 完成度 ${submission.completionPercent}%` }),
    createFieldsSection("review-profile", profileItems(submission, noop, false), { layout: { columns: 2 }, header: { title: "填报人信息" } }),
    createFieldsSection("review-process", [
      ...processItems(submission, noop, false),
      ...evidenceItems(submission, noop, false, [], {
        busyEvidenceKey: null,
        onDownload: onDownloadAttachment,
      }),
    ], { layout: { columns: 1 }, header: { title: "流程与材料" } }),
    createFieldsSection("review-answers", questionItems(ERP_DILIGENCE_QUESTION_SECTIONS, submission, noop, false), { layout: { columns: 1 }, header: { title: "业务回答" } }),
  ];
}

export default function ErpDueDiligenceClient({
  user,
  canEdit,
  canViewAll,
}: {
  user: SessionUser;
  canEdit: boolean;
  canViewAll: boolean;
}) {
  const feedback = useFeedback();
  const {
    data,
    draft,
    setDraft,
    loading,
    error,
    saving,
    save,
    attachmentBusyKey,
    uploadEvidenceAttachment,
    deleteEvidenceAttachment,
  } = useErpDiligence(user);
  const [activeTab, setActiveTab] = useState<DiligenceTab>("profile");
  const [reviewId, setReviewId] = useState<number | null>(null);
  const selectedReview = useMemo(
    () => data.submissions.find((submission) => submission.id === reviewId) ?? null,
    [data.submissions, reviewId],
  );
  const selectedDepartmentId = data.positionOptions.find((position) => (
    position.assignmentId === draft.positionAssignmentId
  ))?.departmentId ?? null;
  const responsibilityPositions = useMemo(() => (
    selectedDepartmentId
      ? data.responsibilityPositionOptions.filter((position) => position.scopeDepartmentIds.includes(selectedDepartmentId))
      : []
  ), [data.responsibilityPositionOptions, selectedDepartmentId]);
  const tabs = canViewAll ? [...ERP_DILIGENCE_TABS, { key: "review", label: "汇总查看" } as const] : ERP_DILIGENCE_TABS;

  async function persist(status: ErpDiligenceDraft["status"]) {
    if (!canEdit) return;
    try {
      await save(status);
      feedback.success(status === "submitted" ? "尽调表已提交，可继续补充并再次提交" : "草稿已保存");
    } catch (cause) {
      feedback.error(cause instanceof Error ? cause.message : "保存失败");
    }
  }

  function downloadAttachment(attachment: ErpDiligenceEvidenceAttachment) {
    window.open(
      workspacePath(`/api/modules/administration/erp-diligence/attachments/${attachment.attachmentUid}`),
      "_blank",
      "noopener,noreferrer",
    );
  }

  async function uploadAttachment(evidenceKey: string, file: File) {
    try {
      await uploadEvidenceAttachment(evidenceKey, file);
      feedback.success("样表附件已上传");
    } catch (cause) {
      feedback.error(cause instanceof Error ? cause.message : "附件上传失败");
    }
  }

  async function deleteAttachment(attachment: ErpDiligenceEvidenceAttachment) {
    const confirmed = await feedback.confirmDelete({ message: `确定删除附件“${attachment.fileName}”吗？` });
    if (!confirmed) return;
    try {
      await deleteEvidenceAttachment(attachment);
      feedback.success("附件已删除");
    } catch (cause) {
      feedback.error(cause instanceof Error ? cause.message : "附件删除失败");
    }
  }

  const draftActions: FormSurfaceActionSpec[] | undefined = canEdit ? [
    { key: "save-draft", action: "save", label: saving ? "保存中…" : "保存草稿", disabled: saving, onClick: () => void persist("draft") },
  ] : undefined;
  const submissionActions: FormSurfaceActionSpec[] | undefined = canEdit ? [
    { key: "submit", action: "submit", label: saving ? "提交中…" : "提交当前版本", disabled: saving, onClick: () => void persist("submitted") },
  ] : undefined;

  function ownSections(): BodySurfaceSectionSpec[] {
    const shared = [metrics(draft)];
    if (activeTab === "profile") return [
      ...shared,
      createMessageSection("purpose", { tone: "default", content: "这不是未来ERP需求表，而是现状事实采集。请按今天真实如何做、谁负责、用什么工具、产生什么单据来填写；不知道的内容可以留空并在流程步骤中标注待确认。" }),
      createMessageSection("visibility", { tone: "muted", content: "默认只有你本人能查看和修改这份记录；获得“ERP尽调全量查看”权限的项目负责人可以汇总查看所有提交。" }),
      createFieldsSection("profile", profileItems(draft, setDraft, canEdit, data.positionOptions), { layout: { columns: 2 }, header: { title: "填报人和业务范围", description: "岗位来自当前填报人的 HR 在岗记录，部门随岗位自动带入。" }, actions: draftActions }),
    ];
    if (activeTab === "process") return [
      ...shared,
      createFieldsSection("process-evidence", [
        ...processItems(draft, setDraft, canEdit, responsibilityPositions),
        ...evidenceItems(draft, setDraft, canEdit, responsibilityPositions, {
          busyEvidenceKey: attachmentBusyKey,
          onUpload: uploadAttachment,
          onDownload: downloadAttachment,
          onDelete: deleteAttachment,
        }),
      ], { layout: { columns: 1 }, actions: draftActions }),
    ];
    const tabSections = ERP_DILIGENCE_QUESTION_SECTIONS.filter((section) => section.tab === activeTab);
    return [
      ...shared,
      ...(activeTab === "summary" ? [createMessageSection("submission-stage", { tone: "muted", content: "这是本轮尽调的最终检查页。确认前面章节和本页回答已经完整后，再提交当前版本；需要继续补充时，可返回其他章节保存草稿。" })] : []),
      createFieldsSection(`questions-${activeTab}`, questionItems(tabSections, draft, setDraft, canEdit), { layout: { columns: 1 }, actions: activeTab === "summary" ? submissionActions : draftActions }),
    ];
  }

  function reviewSections(): BodySurfaceSectionSpec[] {
    const rows = data.submissions;
    const submitted = rows.filter((row) => row.status === "submitted").length;
    return [
      createMetricsSection("review-metrics", { metrics: [
        { key: "people", label: "已开始填报", value: rows.length },
        { key: "submitted", label: "已提交", value: submitted },
        { key: "draft", label: "草稿", value: rows.length - submitted },
        { key: "average", label: "平均完成度", value: rows.length ? `${Math.round(rows.reduce((sum, row) => sum + row.completionPercent, 0) / rows.length)}%` : "0%" },
      ] }),
      createPageTableSection("submissions", {
        rows,
        columns: reviewColumns(),
        visibleColumns: reviewColumns().map((column) => column.key),
        rowKey: (row) => row.id,
        rowState: (row) => row.id === reviewId ? "selected" : "normal",
        rowActions: (row) => [{ key: "view", label: "查看", kind: "view", onClick: () => setReviewId(row.id) }],
        onRowClick: (row) => setReviewId(row.id),
        actionsColumn: { label: "操作" },
        emptyText: "还没有同事开始填报",
        presentation: { density: "compact", rowHover: "interactive" },
        scroll: { x: true },
      }),
      ...(selectedReview ? [createPanelSection("review-detail", { title: `${selectedReview.respondentName}的尽调记录`, sections: readOnlySubmissionSections(selectedReview, downloadAttachment) })] : [createMessageSection("review-tip", { tone: "muted", content: "选择一位填报人后，可在这里查看完整回答。" })]),
    ];
  }

  const bodySections = error
    ? [createMessageSection("load-error", { tone: "danger", content: error })]
    : loading
      ? [createMessageSection("loading", { tone: "muted", content: "正在加载尽调表…" })]
      : activeTab === "review" && canViewAll
        ? reviewSections()
        : ownSections();

  return <PageSurface
    kind="standard"
    tabbar={createPageTabBar({ items: [...tabs], active: activeTab, onChange: (key) => setActiveTab(key as DiligenceTab), ariaLabel: "ERP流程尽调章节" })}
    toolbar={{ items: [{ kind: "text", key: "status", content: draft.status === "submitted" ? `已提交 · ${formatDateTime(data.submission?.submittedAt ?? null)}` : "当前为草稿" }] }}
    body={createPageBody(bodySections)}
  />;
}
