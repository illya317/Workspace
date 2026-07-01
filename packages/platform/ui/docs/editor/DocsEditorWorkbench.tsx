"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createFormSection,
  createMessageSection,
  createPageBody,
  createSectionSection,
  PageSurface,
  type SurfaceToolbarItems,
} from "@workspace/core/ui";
import { workspacePath } from "@workspace/core/routing";
import {
  createEmptyEditorDocument,
  exportEditorDocumentToDocxBlob,
  type EditorDocument,
  type FieldModel,
} from "@workspace/platform/document-editor";
import { useSpacePermissionsSections } from "@workspace/platform/ui/SpacePermissionsPanel";
import {
  createSpaceKindNavigation,
  createSpaceViewToolbarItem,
  createSpaceWorkbenchBody,
  spaceWorkbenchPanelToolbarItems,
  type SpaceWorkbenchKindOption,
} from "../../space-workbench";
import { fetchPreferredDepartmentSettings } from "../../space-preferences";
import {
  createEditorTemplateDraft,
  fetchEditorBootstrap,
  fetchEditorTemplate,
  fetchEditorSpacePermissions,
  saveEditorTemplateDraft,
  setEditorSpacePermissionGrant,
  type EditorSpaceDto,
  type EditorTemplateDetailDto,
  type EditorTemplateListItemDto,
} from "./api";
import { createEditorDetailSection } from "./sections";
import {
  canEdit,
  canManage,
  evaluateFieldModel,
  formatDateTime,
  isEditableSpace,
  normalizeEditorDocument,
  normalizeFieldModel,
  roleLabel,
  statusLabel,
  statusTone,
} from "./model";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function DocsEditorWorkbench({ initialTemplateId = null }: { initialTemplateId?: string | null } = {}) {
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
  const hydratedDefaultSpaceIdRef = useRef<string | null>(null);

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
  const canCreateTemplate = Boolean(activeSpace?.actionPermissions.canCreate && isEditableSpace(activeSpace));
  const canWriteTemplate = Boolean(detail && detailSpace?.actionPermissions.canWrite && canEdit(detail.role));
  const canExportTemplate = Boolean(detail && detailSpace?.actionPermissions.canExport);
  const canManageSpace = canManage(activeSpace?.role);
  const formulaComputation = useMemo(() => evaluateFieldModel(fieldModelDraft), [fieldModelDraft]);
  const handlePermissionToast = useCallback((toast: { message: string }) => setMessage(toast.message), []);
  const listSpacePermissions = useCallback((space: EditorSpaceDto) => (
    fetchEditorSpacePermissions(space.id)
  ), []);
  const setSpacePermissionGrant = useCallback((space: EditorSpaceDto, input: Parameters<typeof setEditorSpacePermissionGrant>[1]) => (
    setEditorSpacePermissionGrant(space.id, input)
  ), []);
  const permissionSections = useSpacePermissionsSections({
    target: activeSpace,
    canManage: canManageSpace,
    enabled: activeTab === "permissions",
    onToast: handlePermissionToast,
    listPermissions: listSpacePermissions,
    setPermissionActionGrant: setSpacePermissionGrant,
    saveSuccessText: "模板空间权限已保存",
    loadErrorText: "加载模板空间权限失败",
    saveErrorText: "保存模板空间权限失败",
  });

  useEffect(() => {
    if (activeTab === "permissions" && !canManageSpace) setActiveTab("templates");
  }, [activeTab, canManageSpace]);

  useEffect(() => {
    if (!activeSpaceNavigationKey || !activeSpace) return;
    if (filteredSpaces.some((space) => space.id === activeSpace.id)) return;
    const fallback = filteredSpaces[0] ?? null;
    if (fallback) setActiveSpaceId(fallback.id);
  }, [activeSpace, activeSpaceNavigationKey, filteredSpaces]);

  async function handleCreateTemplate() {
    const title = createTitle.trim();
    if (!title) {
      setMessage("请输入文件名");
      return;
    }
    if (!activeSpace || !canCreateTemplate) {
      setMessage("当前模板空间不可新增模板");
      return;
    }
    setCreating(true);
    setMessage(null);
    try {
      const saved = await createEditorTemplateDraft({
        spaceId: activeSpace.id,
        title,
        type: "document",
        document: createEmptyEditorDocument(title),
        fieldModel: { schemaVersion: 1, fields: {}, formulas: {} },
      });
      setCreateTitle("");
      setCreateOpen(false);
      setTemplates((current) => [saved, ...current.filter((template) => template.id !== saved.id)]);
      setActiveTemplateId(saved.id);
      setDetail(saved);
      setDocumentDraft(normalizeEditorDocument(saved));
      setFieldModelDraft(normalizeFieldModel(saved.fieldModel));
      pushTemplateHistory(saved.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建模板失败");
    } finally {
      setCreating(false);
    }
  }

  async function saveDraft() {
    if (!detail) return;
    if (!canWriteTemplate) {
      setMessage("当前模板无保存权限");
      return;
    }
    setBusy("save");
    setMessage(null);
    try {
      const saved = await saveEditorTemplateDraft(detail.id, {
        title: detail.title,
        document: documentDraft,
        fieldModel: fieldModelDraft,
      });
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

  async function exportDocx() {
    if (!canExportTemplate) {
      setMessage("当前模板无导出权限");
      return;
    }
    setBusy("export");
    setMessage(null);
    try {
      const blob = await exportEditorDocumentToDocxBlob(documentDraft, formulaComputation.previewValues);
      downloadBlob(blob, `${detail?.title ?? documentDraft.title}.docx`);
      setMessage("DOCX 已生成");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导出 DOCX 失败");
    } finally {
      setBusy(null);
    }
  }

  const editorToolbarItems: SurfaceToolbarItems = activeTab === "templates" ? [
    {
      kind: "icon-button",
      key: "save",
      icon: "save",
      label: "保存草稿",
      variant: "primary",
      onClick: saveDraft,
      disabled: !detail || busy === "save" || !canWriteTemplate,
    },
    {
      kind: "icon-button",
      key: "export",
      icon: "download",
      label: "导出 DOCX",
      onClick: exportDocx,
      disabled: !detail || busy === "export" || !canExportTemplate,
    },
  ] : [];

  const left = {
    kind: "selector" as const,
    selector: {
      kind: "list" as const,
      title: activeSpace ? activeSpace.title : "文档模板",
      commands: [
        { key: "create", icon: "add" as const, label: "新增", variant: "primary" as const, onClick: () => setCreateOpen((open) => !open), disabled: loading || !canCreateTemplate },
      ],
      items: templates,
      selectedId: activeTemplateId,
      loading,
      loadingText: "加载模板...",
      emptyText: "暂无模板",
      getKey: (item: EditorTemplateListItemDto) => item.id,
      onSelect: (item: EditorTemplateListItemDto) => {
        setActiveTemplateId(item.id);
        setActiveTab("templates");
        pushTemplateHistory(item.id);
      },
      renderItem: (item: EditorTemplateListItemDto) => ({
        title: item.title,
        subtitle: `${item.stageCount ?? 0} 阶段 · ${item.tableCount ?? 0} 表格 · ${item.fieldCount ?? 0} 字段 · ${item.formulaCount ?? 0} 公式`,
        code: statusLabel(item.status),
        codeTone: statusTone(item.status),
        meta: [
          roleLabel(item.role),
          item.type.toUpperCase(),
          formatDateTime(item.updatedAt),
        ],
      }),
      size: "sm" as const,
    },
  };
  const viewOptions = canManageSpace
    ? DOCS_EDITOR_VIEW_OPTIONS
    : DOCS_EDITOR_VIEW_OPTIONS.filter((option) => option.key !== "permissions");

  const templateEditorSection = createSectionSection("docs-editor-template-editor", {
    title: detail ? detail.title : activeSpace ? `${activeSpace.title}编辑器` : "模板编辑器",
    sections: [
      ...(message ? [createMessageSection("docs-editor-list-message", { content: message, tone: message.includes("失败") ? "danger" as const : "success" as const })] : []),
      ...(createOpen ? [createFormSection("docs-editor-create-template", {
        kind: "filters",
        content: {
          items: [{
            key: "title",
            label: "文件名",
            required: true,
            spec: { valueType: "string", control: "text", validation: { required: true } },
            value: createTitle,
            placeholder: "请输入文件名",
            onChange: (value) => setCreateTitle(String(value ?? "")),
          }],
          layout: { flow: "inline", columns: 2, commandPlacement: "inline" },
        },
        submit: { onSubmit: () => void handleCreateTemplate() },
        commands: [
          { key: "create", label: creating ? "创建中..." : "创建", icon: "add", type: "submit", variant: "primary", disabled: creating || !createTitle.trim() },
          {
            key: "cancel",
            label: "取消",
            icon: "cancel",
            disabled: creating,
            onClick: () => {
              setCreateOpen(false);
              setCreateTitle("");
            },
          },
        ],
      }, { autoReveal: true })] : []),
      createEditorDetailSection({
        detail,
        detailLoading,
        documentDraft,
        fieldModelDraft,
        formulaComputation,
        message: null,
        editable: canWriteTemplate,
        setDocumentDraft,
      }),
    ],
  });

  const permissionSection = createSectionSection("docs-editor-space-permissions", {
    title: activeSpace ? `${activeSpace.title}权限管理` : "权限管理",
    sections: [
      ...(message ? [createMessageSection("docs-editor-permission-message", { content: message, tone: "muted" as const })] : []),
      ...permissionSections,
    ],
  });

  const right = createPageBody([
    activeTab === "permissions" ? permissionSection : templateEditorSection,
  ]);

  return (
    <PageSurface
      kind="standard"
      navigation={activeSpace && spaceKindOptions.length > 0 ? createSpaceKindNavigation({
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
            onOpenDrawer: () => setDrawerOpen(true),
            onToggleSide: () => setSideOpen(!sideOpen),
          }),
          createSpaceViewToolbarItem({
            key: "docs-editor-view",
            value: activeTab,
            options: viewOptions,
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
      })}
    />
  );
}

function pushTemplateHistory(templateId: string) {
  if (typeof window === "undefined") return;
  window.history.pushState(null, "", workspacePath(`/docs/editor/templates/${encodeURIComponent(templateId)}`));
}

const DOCS_EDITOR_VIEW_OPTIONS: SpaceWorkbenchKindOption[] = [
  { key: "templates", label: "文档模板" },
  { key: "permissions", label: "权限管理" },
];

function docsSpaceTargetKey(space: EditorSpaceDto) {
  return `${space.kind}:${space.targetId}`;
}

function docsDepartmentLabel(space: EditorSpaceDto) {
  return space.title.replace(/模板空间$/, "") || space.title;
}

function preferredDocsDepartmentSpaces(spaces: EditorSpaceDto[], preferredDepartmentIds: number[], activeSpace: EditorSpaceDto | null) {
  const departments = spaces.filter((space) => space.kind === "department");
  const byTargetId = new Map(departments.map((space) => [space.targetId, space]));
  const preferred = preferredDepartmentIds.map((id) => byTargetId.get(id)).filter((space): space is EditorSpaceDto => Boolean(space));
  const visible = preferred.slice(0, 3);
  if (activeSpace?.kind === "department" && !visible.some((space) => space.id === activeSpace.id)) return [...visible, activeSpace];
  return visible;
}

function docsSpaceKindOptions(spaces: EditorSpaceDto[], preferredDepartmentIds: number[], activeSpace: EditorSpaceDto | null): SpaceWorkbenchKindOption[] {
  const items: SpaceWorkbenchKindOption[] = [];
  const personal = spaces.find((space) => space.kind === "personal");
  const committee = spaces.find((space) => space.kind === "committee");
  const company = spaces.find((space) => space.kind === "company");
  if (personal) items.push({ key: docsSpaceTargetKey(personal), label: "个人" });
  preferredDocsDepartmentSpaces(spaces, preferredDepartmentIds, activeSpace).forEach((space) => {
    items.push({ key: docsSpaceTargetKey(space), label: docsDepartmentLabel(space) });
  });
  if (committee) items.push({ key: docsSpaceTargetKey(committee), label: "运营委员会" });
  if (company) items.push({ key: docsSpaceTargetKey(company), label: "公司" });
  return items;
}

function docsSpaceNavigationKey(activeSpace: EditorSpaceDto, items: SpaceWorkbenchKindOption[]) {
  const exactKey = docsSpaceTargetKey(activeSpace);
  return items.some((item) => item.key === exactKey) ? exactKey : items[0]?.key ?? null;
}

function filterDocsSpacesByNavigation(spaces: EditorSpaceDto[], key: string | null) {
  if (!key) return spaces;
  return spaces.filter((space) => docsSpaceTargetKey(space) === key);
}

function docsNavigationTargetSpace(spaces: EditorSpaceDto[], key: string, activeSpace: EditorSpaceDto | null) {
  const exact = spaces.find((space) => docsSpaceTargetKey(space) === key) ?? null;
  if (exact) return exact;
  return activeSpace && docsSpaceTargetKey(activeSpace) === key ? activeSpace : null;
}
