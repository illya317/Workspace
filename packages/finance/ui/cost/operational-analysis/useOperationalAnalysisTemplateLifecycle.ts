"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import {
  createMessageSection,
  createPageModalSection,
  createPageTableSection,
  createStatusSection,
  useFeedback,
  type BodySurfaceBodyInputSpec,
  type BodySurfaceSectionSpec,
  type DataSurfaceColumnSpec,
  type SurfaceToolbarItems,
} from "@workspace/core/ui";
import type {
  OperationalAnalysisManagedTemplateDTO,
  OperationalAnalysisScopeType,
  OperationalAnalysisTemplateLifecycleAction,
  OperationalAnalysisTemplateLifecycleDTO,
  OperationalAnalysisTemplateRevisionKind,
  OperationalAnalysisTemplateRevisionSummaryDTO,
} from "@workspace/finance/types";

type LifecycleResponse = {
  success?: boolean;
  data?: OperationalAnalysisTemplateLifecycleDTO | OperationalAnalysisManagedTemplateDTO;
  error?: string;
};

export type OperationalAnalysisRevisionPreview = {
  templateId: number;
  expectedRevision: number;
  revision: number;
  templateName: string;
};

const CHANGE_KIND_LABELS: Record<OperationalAnalysisTemplateRevisionKind, string> = {
  legacy: "历史版本",
  draft: "保存草稿",
  publish: "发布",
  rollback: "回滚发布",
  discard: "放弃草稿",
  archive: "归档",
  restore: "恢复草稿",
};

export function useOperationalAnalysisTemplateLifecycle(input: {
  scopeType: OperationalAnalysisScopeType;
  scopeId: number;
  template: OperationalAnalysisManagedTemplateDTO | null;
  onChanged: () => void | Promise<void>;
}) {
  const feedback = useFeedback();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<OperationalAnalysisTemplateLifecycleDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<OperationalAnalysisTemplateLifecycleAction | null>(null);
  const [preview, setPreview] = useState<OperationalAnalysisRevisionPreview | null>(null);

  const load = useCallback(async (requestedPage = page) => {
    if (!input.template) return;
    setLoading(true);
    try {
      const response = await fetch(workspacePath(
        `/api/modules/finance/cost/operational-analytics/spaces/${input.scopeType}/${input.scopeId}/templates/${input.template.id}/lifecycle?page=${requestedPage}&pageSize=20`,
      ));
      const body = await response.json() as LifecycleResponse;
      if (!response.ok || !body.success || !body.data || !("revisions" in body.data)) {
        throw new Error(body.error || "版本记录加载失败");
      }
      setDetail(body.data);
      setPage(requestedPage);
    } catch (cause) {
      feedback.error(cause instanceof Error ? cause.message : "版本记录加载失败");
    } finally {
      setLoading(false);
    }
  }, [feedback, input.scopeId, input.scopeType, input.template, page]);

  useEffect(() => {
    setOpen(false);
    setPage(1);
    setDetail(null);
    setPreview(null);
  }, [input.template?.id]);

  const openLifecycle = useCallback(() => {
    if (!input.template) return;
    setOpen(true);
    void load(1);
  }, [input.template, load]);

  const runAction = useCallback(async (
    action: OperationalAnalysisTemplateLifecycleAction,
    sourceRevision?: number,
  ) => {
    const current = detail?.template ?? input.template;
    if (!current || busy) return;
    const confirmation = lifecycleConfirmation(action, sourceRevision);
    const confirmed = await feedback.confirm(confirmation);
    if (!confirmed) return;
    setBusy(action);
    try {
      const response = await fetch(workspacePath(
        `/api/modules/finance/cost/operational-analytics/spaces/${input.scopeType}/${input.scopeId}/templates/${current.id}/lifecycle`,
      ), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          expectedRevision: current.headRevision,
          ...(action === "rollback" ? { sourceRevision } : {}),
        }),
      });
      const body = await response.json() as LifecycleResponse;
      if (!response.ok || !body.success) throw new Error(body.error || "模板状态更新失败");
      feedback.success(lifecycleSuccessMessage(action));
      setPreview(null);
      await input.onChanged();
      if (action === "archive") {
        setOpen(false);
        setDetail(null);
      } else {
        await load(1);
      }
    } catch (cause) {
      feedback.error(cause instanceof Error ? cause.message : "模板状态更新失败");
    } finally {
      setBusy(null);
    }
  }, [busy, detail?.template, feedback, input, load]);

  const previewRevision = useCallback((revision: number) => {
    const current = detail?.template ?? input.template;
    if (!current) return;
    setPreview({
      templateId: current.id,
      expectedRevision: current.headRevision,
      revision,
      templateName: current.name,
    });
    setOpen(false);
  }, [detail?.template, input.template]);

  const previewHead = useCallback(() => {
    if (!input.template || input.template.status !== "active") return;
    setPreview({
      templateId: input.template.id,
      expectedRevision: input.template.headRevision,
      revision: input.template.headRevision,
      templateName: input.template.name,
    });
    setOpen(false);
  }, [input.template]);

  const toolbarItems = useMemo<SurfaceToolbarItems>(() => input.template ? [{
    kind: "action-group",
    key: "operational-analysis-lifecycle",
    actions: [{
      key: "versions",
      kind: "audit",
      label: input.template.hasDraft ? "版本与发布（有草稿）" : "版本与发布",
      onClick: openLifecycle,
    }],
  }] : [], [input.template, openLifecycle]);

  const modalSection = useMemo<BodySurfaceBodyInputSpec>(() => {
    const current = detail?.template ?? input.template;
    const sections: BodySurfaceSectionSpec[] = loading && !detail
      ? [createStatusSection("operational-analysis-lifecycle-loading", { kind: "loading", content: "版本记录加载中…" })]
      : current
        ? [
            createMessageSection("operational-analysis-lifecycle-status", {
              tone: current.status === "archived" ? "muted" : current.hasDraft ? "warning" : "success",
              content: lifecycleStatusMessage(current),
            }),
            lifecycleHistorySection(detail, current, busy, previewRevision, runAction),
          ]
        : [createStatusSection("operational-analysis-lifecycle-empty", { kind: "empty", content: "请选择一个 Workspace 模板。" })];
    return createPageModalSection("operational-analysis-lifecycle-modal", {
      open,
      title: current ? `${current.name} · 版本与发布` : "版本与发布",
      onClose: () => setOpen(false),
      size: "lg",
      sections,
      actions: current ? lifecycleModalActions(current, busy, runAction) : [],
      pagination: detail && detail.total > detail.pageSize ? {
        page: detail.page,
        total: detail.total,
        totalPages: Math.max(1, Math.ceil(detail.total / detail.pageSize)),
        onPageChange: (nextPage) => void load(nextPage),
      } : undefined,
    });
  }, [busy, detail, input.template, load, loading, open, previewRevision, runAction]);

  return {
    toolbarItems,
    modalSection,
    preview,
    previewHead,
    clearPreview: () => setPreview(null),
  };
}

function lifecycleHistorySection(
  detail: OperationalAnalysisTemplateLifecycleDTO | null,
  current: OperationalAnalysisManagedTemplateDTO,
  busy: OperationalAnalysisTemplateLifecycleAction | null,
  onPreview: (revision: number) => void,
  onAction: (action: OperationalAnalysisTemplateLifecycleAction, sourceRevision?: number) => void,
) {
  const rows = detail?.revisions ?? [];
  const columns: DataSurfaceColumnSpec<OperationalAnalysisTemplateRevisionSummaryDTO>[] = [
    { key: "revision", label: "版本", cell: (row) => `v${row.revision}` },
    { key: "changeKind", label: "变更", cell: (row) => CHANGE_KIND_LABELS[row.changeKind] },
    {
      key: "state",
      label: "状态",
      cell: (row) => ({
        kind: "stack",
        items: [
          ...(row.isPublished ? [{ kind: "badge" as const, label: "当前发布", tone: "green" as const }] : []),
          ...(row.isHead ? [{ kind: "badge" as const, label: "当前草稿头", tone: "amber" as const }] : []),
          ...(!row.isPublished && !row.isHead ? [{ kind: "text" as const, value: "历史", tone: "muted" as const }] : []),
        ],
      }),
    },
    { key: "createdAt", label: "记录时间", cell: (row) => formatDateTime(row.createdAt) },
  ];
  return createPageTableSection("operational-analysis-lifecycle-history", {
    rows,
    columns,
    visibleColumns: columns.map((column) => column.key),
    rowKey: (row) => row.revision,
    presentation: { density: "compact", header: "strong", rowHover: "neutral" },
    emptyText: "暂无版本记录",
    rowActions: (row) => [
      {
        key: `preview-${row.revision}`,
        kind: "view",
        label: `预览 v${row.revision}`,
        disabled: Boolean(busy) || current.status === "archived",
        onClick: () => onPreview(row.revision),
      },
      ...(row.wasPublished && !row.isPublished && current.actions.rollback.enabled ? [{
        key: `rollback-${row.revision}`,
        kind: "restore" as const,
        label: `回滚到 v${row.revision}`,
        disabled: Boolean(busy),
        onClick: () => onAction("rollback", row.revision),
      }] : []),
    ],
  });
}

function lifecycleModalActions(
  template: OperationalAnalysisManagedTemplateDTO,
  busy: OperationalAnalysisTemplateLifecycleAction | null,
  onAction: (action: OperationalAnalysisTemplateLifecycleAction) => void,
) {
  return [
    ...(template.actions.publish.enabled ? [{ key: "publish", label: busy === "publish" ? "发布中…" : "发布草稿", icon: "upload" as const, variant: "primary" as const, disabled: Boolean(busy), onClick: () => onAction("publish") }] : []),
    ...(template.actions.discard.enabled ? [{ key: "discard", label: busy === "discard" ? "放弃中…" : "放弃草稿", icon: "cancel" as const, disabled: Boolean(busy), onClick: () => onAction("discard") }] : []),
    ...(template.actions.archive.enabled ? [{ key: "archive", label: busy === "archive" ? "归档中…" : "归档模板", icon: "archive" as const, variant: "danger" as const, disabled: Boolean(busy), onClick: () => onAction("archive") }] : []),
    ...(template.actions.restore.enabled ? [{ key: "restore", label: busy === "restore" ? "恢复中…" : "恢复为草稿", icon: "restore" as const, disabled: Boolean(busy), onClick: () => onAction("restore") }] : []),
  ];
}

function lifecycleStatusMessage(template: OperationalAnalysisManagedTemplateDTO) {
  if (template.status === "archived") {
    return `模板已归档，当前头版本为 v${template.headRevision}。恢复后会生成新的草稿，不会直接重新上线。`;
  }
  if (template.publishedRevision === null) {
    return `当前是首次草稿 v${template.headRevision}，普通读者尚不可见。请先预览，再发布。`;
  }
  if (template.hasDraft) {
    return `读者仍在使用 v${template.publishedRevision}；当前草稿头为 v${template.headRevision}。预览确认后再发布。`;
  }
  return `当前发布版本为 v${template.publishedRevision}，没有待发布草稿。回滚会复制旧版本并生成新的发布版本。`;
}

function lifecycleConfirmation(action: OperationalAnalysisTemplateLifecycleAction, sourceRevision?: number) {
  if (action === "publish") return { title: "发布经营分析模板", message: "发布后，普通读者将切换到这份草稿。发布前会再次校验当前数据源权限与版本。", confirmLabel: "确认发布" };
  if (action === "rollback") return { title: "回滚经营分析模板", message: `系统会复制 v${sourceRevision} 并生成一个新的正式版本，历史不会被覆盖。`, confirmLabel: "确认回滚", confirmDanger: true };
  if (action === "discard") return { title: "放弃当前草稿", message: "系统会复制当前正式版本生成新的头版本，草稿历史仍保留但不再生效。", confirmLabel: "放弃草稿", confirmDanger: true };
  if (action === "archive") return { title: "归档经营分析模板", message: "归档后模板会从普通读者的模板列表移除，可以稍后恢复为草稿。", confirmLabel: "确认归档", confirmDanger: true };
  return { title: "恢复经营分析模板", message: "恢复会生成一份新的草稿，需重新预览和发布后才会对普通读者生效。", confirmLabel: "恢复为草稿" };
}

function lifecycleSuccessMessage(action: OperationalAnalysisTemplateLifecycleAction) {
  return {
    publish: "草稿已发布",
    rollback: "已生成新的回滚发布版本",
    discard: "当前草稿已放弃",
    archive: "模板已归档",
    restore: "模板已恢复为草稿",
  }[action];
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}
