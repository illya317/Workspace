"use client";

import {
  calculateErpDiligenceCompletion,
  ERP_DILIGENCE_AREA_OPTIONS,
  ERP_DILIGENCE_QUESTION_COUNT,
  ERP_DILIGENCE_QUESTION_KEYS,
  ERP_DILIGENCE_QUESTION_SECTIONS,
} from "@workspace/administration/constants";
import type { ErpDiligenceDraft, ErpDiligenceSubmissionDto } from "@workspace/administration/types";
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

const BASE_TABS = [
  { key: "profile", label: "填报说明" },
  { key: "process", label: "流程与材料" },
  { key: "commercial", label: "销售与订单" },
  { key: "fulfillment", label: "交付与验收" },
  { key: "finance", label: "开票与回款" },
  { key: "systems", label: "系统与例外" },
  { key: "summary", label: "问题与需求" },
] as const;

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
  const answered = ERP_DILIGENCE_QUESTION_KEYS.filter((key) => Boolean(draft.answers[key]?.trim())).length;
  return createMetricsSection("diligence-metrics", {
    metrics: [
      { key: "completion", label: "整体完成度", value: `${calculateErpDiligenceCompletion(draft)}%` },
      { key: "answers", label: "已回答问题", value: `${answered} / ${ERP_DILIGENCE_QUESTION_COUNT}` },
      { key: "steps", label: "流程步骤", value: draft.processSteps.length },
      { key: "evidence", label: "材料线索", value: draft.evidenceItems.length },
    ],
  });
}

function readOnlySubmissionSections(submission: ErpDiligenceSubmissionDto): BodySurfaceSectionSpec[] {
  const noop = () => undefined;
  return [
    createMessageSection("review-status", { tone: submission.status === "submitted" ? "success" : "muted", content: `${submission.respondentName} · ${submission.status === "submitted" ? `提交于 ${formatDateTime(submission.submittedAt)}` : "仍为草稿"} · 完成度 ${submission.completionPercent}%` }),
    createFieldsSection("review-profile", profileItems(submission, noop, false), { layout: { columns: 2 }, header: { title: "填报人信息" } }),
    createFieldsSection("review-process", [...processItems(submission, noop, false), ...evidenceItems(submission, noop, false)], { layout: { columns: 1 }, header: { title: "流程与材料" } }),
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
  const { data, draft, setDraft, loading, error, saving, save } = useErpDiligence(user);
  const [activeTab, setActiveTab] = useState<DiligenceTab>("profile");
  const [reviewId, setReviewId] = useState<number | null>(null);
  const selectedReview = useMemo(
    () => data.submissions.find((submission) => submission.id === reviewId) ?? null,
    [data.submissions, reviewId],
  );
  const tabs = canViewAll ? [...BASE_TABS, { key: "review", label: "汇总查看" } as const] : BASE_TABS;

  async function persist(status: ErpDiligenceDraft["status"]) {
    if (!canEdit) return;
    try {
      await save(status);
      feedback.success(status === "submitted" ? "尽调表已提交，可继续补充并再次提交" : "草稿已保存");
    } catch (cause) {
      feedback.error(cause instanceof Error ? cause.message : "保存失败");
    }
  }

  const formActions: FormSurfaceActionSpec[] | undefined = canEdit ? [
    { key: "save-draft", action: "save", label: saving ? "保存中…" : "保存草稿", disabled: saving, onClick: () => void persist("draft") },
    { key: "submit", action: "submit", label: saving ? "提交中…" : "提交当前版本", disabled: saving, onClick: () => void persist("submitted") },
  ] : undefined;

  function ownSections(): BodySurfaceSectionSpec[] {
    const shared = [metrics(draft)];
    if (activeTab === "profile") return [
      ...shared,
      createMessageSection("purpose", { tone: "default", content: "这不是未来ERP需求表，而是现状事实采集。请按今天真实如何做、谁负责、用什么工具、产生什么单据来填写；不知道的内容可以留空并在流程步骤中标注待确认。" }),
      createMessageSection("visibility", { tone: "muted", content: "默认只有你本人能查看和修改这份记录；获得“ERP尽调全量查看”权限的项目负责人可以汇总查看所有提交。" }),
      createFieldsSection("profile", profileItems(draft, setDraft, canEdit), { layout: { columns: 2 }, header: { title: "填报人和业务范围", description: "先说明你代表哪个部门、岗位和流程环节。" }, actions: formActions }),
    ];
    if (activeTab === "process") return [
      ...shared,
      createFieldsSection("process-evidence", [...processItems(draft, setDraft, canEdit), ...evidenceItems(draft, setDraft, canEdit)], { layout: { columns: 1 }, actions: formActions }),
    ];
    const tabSections = ERP_DILIGENCE_QUESTION_SECTIONS.filter((section) => section.tab === activeTab);
    return [
      ...shared,
      createFieldsSection(`questions-${activeTab}`, questionItems(tabSections, draft, setDraft, canEdit), { layout: { columns: 1 }, actions: formActions }),
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
      ...(selectedReview ? [createPanelSection("review-detail", { title: `${selectedReview.respondentName}的尽调记录`, sections: readOnlySubmissionSections(selectedReview) })] : [createMessageSection("review-tip", { tone: "muted", content: "选择一位填报人后，可在这里查看完整回答。" })]),
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
