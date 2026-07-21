"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPageBody,
  PageSurface,
  usePageAssistant,
  useFeedback,
  type BodySurfaceCommandSpec,
  type SurfaceToolbarItems,
} from "@workspace/core/ui";
import { createEmptyEditorDocument, useDocumentEditorMobileLayout, type EditorDocument, type FieldModel } from "@workspace/platform/document-editor";
import { actionRuntimeCommands, actionRuntimeCreateSubmission, workflowActionHeaderCommands } from "../../workflow";
import {
  createSpaceKindNavigation,
  createSpaceViewToolbarItem,
  createSpaceWorkbenchBody,
  spaceWorkbenchPanelToolbarItems,
} from "../../space-workbench";
import { fetchPreferredDepartmentSettings } from "../../space-preferences";
import { buildDocsEditorAssistantContext } from "./assistant-context";
import {
  createEditorTemplateDraft,
  fetchEditorBootstrap,
  fetchEditorTemplate,
  publishEditorTemplateDraft,
  saveEditorTemplateDraft,
  type EditorSpaceDto,
  type EditorTemplateDetailDto,
  type EditorTemplateListItemDto,
} from "./api";
import { docsEditorBody, docsEditorLeftPane } from "./workbench-content";
import { useDocsEditorWorkflowSection } from "./workflow-panel";
import {
  DOCS_EDITOR_VIEW_OPTIONS,
  docsNavigationTargetSpace,
  docsSpaceKindOptions,
  docsSpaceNavigationKey,
  filterDocsSpacesByNavigation,
  pushTemplateHistory,
} from "./workbench-navigation";
import {
  evaluateFieldModel,
  normalizeEditorDocument,
  normalizeFieldModel,
} from "./model";
import { createDocsEditorTemplateActions } from "./template-actions";

function namespaceHeaderActions(actions: readonly BodySurfaceCommandSpec[], namespace: string): BodySurfaceCommandSpec[] {
  return actions.map((action) => ({ ...action, key: `${namespace}.${action.key}` }));
}

export default function DocsEditorWorkbench({ currentUserId, initialTemplateId = null }: { currentUserId: number; initialTemplateId?: string | null }) {
  const [spaces, setSpaces] = useState<EditorSpaceDto[]>([]);
  const [templates, setTemplates] = useState<EditorTemplateListItemDto[]>([]);
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(initialTemplateId);
  const [detail, setDetail] = useState<EditorTemplateDetailDto | null>(null);
  const [documentDraft, setDocumentDraft] = useState<EditorDocument>(() => createEmptyEditorDocument());
  const [fieldModelDraft, setFieldModelDraft] = useState<FieldModel>(() => ({ schemaVersion: 1, fields: {}, formulas: {} }));
  const [activeTab, setActiveTab] = useState("templates");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sideOpen, setSideOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [preferredDepartmentIds, setPreferredDepartmentIds] = useState<number[]>([]);
  const [focusApprovalId, setFocusApprovalId] = useState<number | null>(null);
  const hydratedDefaultSpaceIdRef = useRef<string | null>(null);
  const pageAssistant = usePageAssistant();
  const feedback = useFeedback();
  const documentEditorLayout = useDocumentEditorMobileLayout();

  useEffect(() => {
    if (documentEditorLayout.compactLandscape) setSideOpen(false);
  }, [documentEditorLayout.compactLandscape]);

  const loadBootstrap = useCallback(async (spaceId: string | null) => {
    setLoading(true);
    try {
      const data = await fetchEditorBootstrap(spaceId ?? undefined);
      const initialTemplate = initialTemplateId ? data.templates.find((template) => template.id === initialTemplateId) : null;
      setSpaces(data.spaces);
      setTemplates(data.templates);
      setActiveSpaceId((current) => {
        const next = current ?? initialTemplate?.spaceId ?? data.spaces[0]?.id ?? null;
        if (!spaceId && !current) hydratedDefaultSpaceIdRef.current = next;
        return next;
      });
      setActiveTemplateId((current) => {
        if (current && data.templates.some((template) => template.id === current)) return current;
        return initialTemplate?.id ?? data.templates[0]?.id ?? null;
      });
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载模板编辑器失败");
    } finally {
      setLoading(false);
    }
  }, [initialTemplateId]);

  useEffect(() => {
    if (activeSpaceId && hydratedDefaultSpaceIdRef.current === activeSpaceId) {
      hydratedDefaultSpaceIdRef.current = null;
      return;
    }
    void loadBootstrap(activeSpaceId);
  }, [activeSpaceId, loadBootstrap]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const requestId = Number(new URLSearchParams(window.location.search).get("approvalId"));
    if (!Number.isInteger(requestId) || requestId <= 0) return;
    setFocusApprovalId(requestId);
    setActiveTab("workflow");
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchPreferredDepartmentSettings()
      .then((settings) => {
        if (!cancelled) setPreferredDepartmentIds(settings.preferredDepartmentIds);
      })
      .catch(() => {
        if (!cancelled) setPreferredDepartmentIds([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeTemplateId) {
      setDetail(null);
      setDetailLoading(false);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setMessage(null);
    fetchEditorTemplate(activeTemplateId)
      .then((next) => {
        if (cancelled) return;
        setDetail(next);
        setDocumentDraft(normalizeEditorDocument(next));
        setFieldModelDraft(normalizeFieldModel(next.fieldModel));
        setActiveSpaceId((current) => current ?? next.spaceId);
      })
      .catch((error) => {
        if (!cancelled) {
          setDetail(null);
          setMessage(error instanceof Error ? error.message : "加载模板详情失败");
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTemplateId]);

  const activeSpace = spaces.find((space) => space.id === activeSpaceId) ?? spaces[0] ?? null;
  const spaceById = useMemo(() => new Map(spaces.map((space) => [space.id, space])), [spaces]);
  const detailSpace = detail ? spaceById.get(detail.spaceId) ?? null : null;
  const spaceKindOptions = docsSpaceKindOptions(spaces, preferredDepartmentIds, activeSpace);
  const activeSpaceNavigationKey = activeSpace ? docsSpaceNavigationKey(activeSpace, spaceKindOptions) : spaceKindOptions[0]?.key ?? null;
  const filteredSpaces = filterDocsSpacesByNavigation(spaces, activeSpaceNavigationKey);
  const createRuntime = activeSpace?.actionRuntimes.create ?? null;
  const saveRuntime = detail ? detailSpace?.actionRuntimes.save ?? null : null;
  const publishRuntime = detail ? detailSpace?.actionRuntimes.publish ?? null : null;
  const canEditTemplateDraft = saveRuntime?.editability === "editable"
    || publishRuntime?.editability === "editable";
  const canDeleteTemplate = Boolean(detail && detailSpace?.actionPermissions.canDelete);
  const canArchiveTemplate = Boolean(detail && detailSpace?.actionPermissions.canArchive);
  const canExportTemplate = Boolean(detail && detailSpace?.actionPermissions.canExport);
  const formulaComputation = useMemo(() => evaluateFieldModel(fieldModelDraft), [fieldModelDraft]);
  const assistantContext = buildDocsEditorAssistantContext({
    activeSpaceTitle: activeSpace?.title,
    activeTab,
    activeTemplateId,
    detail,
  });

  const reloadEditorData = useCallback(async () => {
    await loadBootstrap(activeSpaceId);
    if (!activeTemplateId) return;
    const next = await fetchEditorTemplate(activeTemplateId);
    setDetail(next);
    setDocumentDraft(normalizeEditorDocument(next));
    setFieldModelDraft(normalizeFieldModel(next.fieldModel));
  }, [activeSpaceId, activeTemplateId, loadBootstrap]);

  useEffect(() => {
    if (!activeSpaceNavigationKey || !activeSpace) return;
    if (filteredSpaces.some((space) => space.id === activeSpace.id)) return;
    const fallback = filteredSpaces[0] ?? null;
    if (fallback) setActiveSpaceId(fallback.id);
  }, [activeSpace, activeSpaceNavigationKey, filteredSpaces]);

  async function handleCreateTemplate() {
    const title = createTitle.trim();
    if (!title) {
      throw new Error("请输入文件名");
    }
    if (!activeSpace || createRuntime?.editability !== "editable") {
      throw new Error("当前模板空间不可新增模板");
    }
    setCreating(true);
    setMessage(null);
    try {
      const outcome = await createEditorTemplateDraft({
        spaceId: activeSpace.id,
        title,
        type: "document",
        document: createEmptyEditorDocument(title),
        fieldModel: { schemaVersion: 1, fields: {}, formulas: {} },
      });
      setCreateTitle("");
      setCreateOpen(false);
      if (outcome.executionMode === "workflow") {
        return { outcome: "submitted" as const, message: "模板新建流程已提交" };
      }
      const saved = outcome.template;
      setTemplates((current) => [saved, ...current.filter((template) => template.id !== saved.id)]);
      setActiveTemplateId(saved.id);
      setDetail(saved);
      setDocumentDraft(normalizeEditorDocument(saved));
      setFieldModelDraft(normalizeFieldModel(saved.fieldModel));
      pushTemplateHistory(saved.id);
      return { outcome: "saved" as const, message: "模板已新建" };
    } catch (error) {
      throw error instanceof Error ? error : new Error("创建模板失败");
    } finally {
      setCreating(false);
    }
  }

  async function saveDraft() {
    if (!detail) return;
    if (saveRuntime?.editability !== "editable") {
      setMessage("当前模板不可保存或提交");
      return;
    }
    setBusy("save");
    setMessage(null);
    try {
      const outcome = await saveEditorTemplateDraft(detail.id, {
        version: detail.version,
        title: detail.title,
        document: documentDraft,
        fieldModel: fieldModelDraft,
      });
      if (outcome.executionMode === "workflow") {
        setMessage("模板草稿已提交审核");
        return;
      }
      const saved = outcome.template;
      setDetail(saved);
      setDocumentDraft(normalizeEditorDocument(saved));
      setFieldModelDraft(normalizeFieldModel(saved.fieldModel));
      setTemplates((current) => current.map((template) => template.id === saved.id ? saved : template));
      setMessage("草稿已保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(null);
    }
  }

  async function publishTemplate() {
    if (!detail || publishRuntime?.editability !== "editable") return;
    setBusy("publish");
    setMessage(null);
    try {
      const outcome = await publishEditorTemplateDraft(detail.id, {
        version: detail.version,
        title: detail.title,
        type: detail.type,
        document: documentDraft,
        fieldModel: fieldModelDraft,
        sourceKind: detail.sourceKind ?? null,
        sourceProductKey: detail.sourceProductKey ?? null,
      });
      if (outcome.executionMode === "workflow") {
        setMessage("模板发布流程已提交");
        return;
      }
      const saved = outcome.template;
      setDetail(saved);
      setTemplates((current) => current.map((template) => template.id === saved.id ? saved : template));
      setMessage("模板已发布");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "发布模板失败");
    } finally {
      setBusy(null);
    }
  }
  const templateActions = createDocsEditorTemplateActions({
    detail,
    documentDraft,
    formulaPreviewValues: formulaComputation.previewValues,
    canDeleteTemplate,
    canArchiveTemplate,
    canExportTemplate,
    confirmDelete: feedback.confirmDelete,
    confirmArchive: feedback.confirm,
    setActiveTemplateId,
    setBusy,
    setDetail,
    setMessage,
    setTemplates,
  });
  const workflowSection = useDocsEditorWorkflowSection({
    activeSpace,
    currentUserId,
    focusRequestId: focusApprovalId,
    onToast: (toast) => feedback.notify(toast.message, toast.type),
    onCommitted: reloadEditorData,
  });

  const editorToolbarItems: SurfaceToolbarItems = activeTab === "templates" ? [
    {
      kind: "icon-button",
      key: "export",
      icon: "download",
      label: "导出 DOCX",
      onClick: templateActions.exportDocx,
      disabled: !detail || busy === "export" || !canExportTemplate,
    },
  ] : [];

  const createSubmission = actionRuntimeCreateSubmission(createRuntime, {
    disabled: creating || !createTitle.trim(),
    execute: handleCreateTemplate,
  });
  const draftHeaderActions = namespaceHeaderActions(workflowActionHeaderCommands(actionRuntimeCommands(saveRuntime, {
      "record.save": { label: "保存草稿", disabled: busy !== null, onClick: () => void saveDraft() },
      "workflow.request.submit": { label: "提交草稿", disabled: busy !== null, onClick: () => void saveDraft() },
      "form.cancel": { label: "取消修改", disabled: busy !== null, onClick: () => void reloadEditorData() },
    })), "draft");
  const publishHeaderActions = namespaceHeaderActions(workflowActionHeaderCommands(actionRuntimeCommands(publishRuntime, {
      "record.save": { label: "发布", presentationKind: "direct", disabled: busy !== null, onClick: () => void publishTemplate() },
      "workflow.request.submit": { label: "提交发布", disabled: busy !== null, onClick: () => void publishTemplate() },
    })), "publish");
  const lifecycleHeaderActions: BodySurfaceCommandSpec[] = [
    ...publishHeaderActions,
    ...draftHeaderActions,
    ...(detail?.status === "draft" && canDeleteTemplate ? [{
      key: "delete", icon: "delete-bin" as const, label: "删除", variant: "danger" as const, disabled: busy !== null, onClick: templateActions.deleteTemplate,
    }] : []),
    ...(detail?.status === "published" && canArchiveTemplate ? [{
      key: "archive", icon: "archive" as const, label: "归档", disabled: busy !== null, onClick: templateActions.archiveTemplate,
    }] : []),
  ];
  const assistantAction = detail ? {
    label: `让 Agent 处理“${detail.title}”`,
    onClick: () => pageAssistant.openAssistant({
      ...assistantContext,
      path: typeof window === "undefined" ? undefined : window.location.pathname,
      title: detail.title,
    }),
  } : undefined;
  const detailHeaderActions: BodySurfaceCommandSpec[] = detail ? lifecycleHeaderActions : [];

  const left = docsEditorLeftPane({
    activeSpace,
    activeTemplateId,
    loading,
    templates,
    onSelectTemplate: (item) => {
      setActiveTemplateId(item.id);
      setActiveTab("templates");
      pushTemplateHistory(item.id);
    },
  });
  const right = activeTab === "workflow"
    ? createPageBody([workflowSection])
    : docsEditorBody({
        activeSpace,
        message,
        createOpen,
        createTitle,
        createSubmission,
        detailHeaderActions,
        detail,
        detailLoading,
        documentDraft,
        fieldModelDraft,
        formulaComputation,
        canEditTemplateDraft,
        assistantAction,
        setDocumentDraft,
        onCreateTitleChange: setCreateTitle,
        onCreateOpenChange: setCreateOpen,
      });

  return (
    <PageSurface
      kind="standard"
      tabbar={activeSpace && spaceKindOptions.length > 0 ? createSpaceKindNavigation({
        items: spaceKindOptions,
        active: activeSpaceNavigationKey ?? spaceKindOptions[0]?.key ?? "personal",
        onChange: (key) => {
          const next = docsNavigationTargetSpace(spaces, key, activeSpace);
          if (next) setActiveSpaceId(next.id);
          setActiveTab("templates");
        },
        ariaLabel: "模板空间类型",
      }) : undefined}
      toolbar={activeSpace ? {
        items: [
          ...spaceWorkbenchPanelToolbarItems({
            label: "模板列表",
            open: sideOpen,
            onToggleSide: () => setSideOpen(!sideOpen),
          }),
          createSpaceViewToolbarItem({
            key: "docs-editor-view",
            value: activeTab,
            options: DOCS_EDITOR_VIEW_OPTIONS,
            onChange: setActiveTab,
            ariaLabel: "模板编辑器视图",
          }),
          ...editorToolbarItems,
        ],
      } : undefined}
      body={createSpaceWorkbenchBody({
        left,
        right,
        label: "模板列表",
        open: sideOpen,
        drawerOpen,
        onOpenChange: setSideOpen,
        onDrawerOpenChange: setDrawerOpen,
        ratio: [0.28, 0.72],
        showControls: false,
        mobileDetailActive: Boolean(activeTemplateId),
      })}
    />
  );
}
