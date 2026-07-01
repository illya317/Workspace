"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createEmptySection,
  createMessageSection,
  createPageBody,
  createPageDataSection,
  createSectionSection,
  InputSurface,
  PageSurface,
  type DataSurfaceColumnSpec,
} from "@workspace/core/ui";
import { createEmptyEditorDocument } from "@workspace/platform/document-editor";
import { businessSpaceKindLabel } from "@workspace/platform/permissions";
import { useSpacePermissionsSections, type SpacePermissionRow } from "@workspace/platform/ui/SpacePermissionsPanel";
import { createSpaceKindNavigation, createSpaceViewToolbarItem, createSpaceWorkbenchBody, type SpaceWorkbenchKindOption } from "../../space-workbench";
import {
  DOCS_EDITOR_REFERENCE_OPTIONS_ENDPOINT,
  createEditorTemplateDraft,
  fetchEditorBootstrap,
  fetchEditorSpacePermissions,
  saveEditorSpacePermissions,
  type EditorSpaceDto,
  type EditorTemplateListItemDto,
} from "./api";
import {
  canManage,
  formatDateTime,
  isEditableSpace,
  roleLabel,
  statusLabel,
  statusTone,
} from "./model";

export default function DocsEditorWorkbench() {
  const router = useRouter();
  const [spaces, setSpaces] = useState<EditorSpaceDto[]>([]);
  const [templates, setTemplates] = useState<EditorTemplateListItemDto[]>([]);
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("templates");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [sideOpen, setSideOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const hydratedDefaultSpaceIdRef = useRef<string | null>(null);

  const loadBootstrap = useCallback(async (spaceId: string | null) => {
    setLoading(true);
    try {
      const data = await fetchEditorBootstrap(spaceId ?? undefined);
      setSpaces(data.spaces);
      setTemplates(data.templates);
      setActiveSpaceId((current) => {
        const next = current ?? data.spaces[0]?.id ?? null;
        if (!spaceId && !current) hydratedDefaultSpaceIdRef.current = next;
        return next;
      });
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载模板编辑器失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeSpaceId && hydratedDefaultSpaceIdRef.current === activeSpaceId) {
      hydratedDefaultSpaceIdRef.current = null;
      return;
    }
    void loadBootstrap(activeSpaceId);
  }, [activeSpaceId, loadBootstrap]);

  const activeSpace = spaces.find((space) => space.id === activeSpaceId) ?? spaces[0] ?? null;
  const filteredSpaces = useMemo(
    () => activeSpace ? spaces.filter((space) => space.kind === activeSpace.kind) : spaces,
    [activeSpace, spaces],
  );
  const canCreateTemplate = Boolean(activeSpace && isEditableSpace(activeSpace));
  const canManageSpace = canManage(activeSpace?.role);
  const handlePermissionToast = useCallback((toast: { message: string }) => setMessage(toast.message), []);
  const listSpacePermissions = useCallback((space: EditorSpaceDto) => (
    fetchEditorSpacePermissions(space.id) as Promise<SpacePermissionRow[]>
  ), []);
  const saveSpacePermissions = useCallback((space: EditorSpaceDto, permissions: Array<{ userId: number; role: SpacePermissionRow["role"] }>) => (
    saveEditorSpacePermissions(space.id, permissions)
  ), []);
  const permissionSections = useSpacePermissionsSections({
    target: activeSpace,
    canManage: canManageSpace,
    enabled: activeTab === "permissions",
    onToast: handlePermissionToast,
    listPermissions: listSpacePermissions,
    savePermissions: saveSpacePermissions,
    referenceEndpoint: DOCS_EDITOR_REFERENCE_OPTIONS_ENDPOINT,
    userFkKey: "docs.editor.permission.user",
    permissionKind: "template",
    saveSuccessText: "模板空间权限已保存",
    loadErrorText: "加载模板空间权限失败",
    saveErrorText: "保存模板空间权限失败",
  });

  useEffect(() => {
    if (activeTab === "permissions" && !canManageSpace) setActiveTab("templates");
  }, [activeTab, canManageSpace]);

  async function createTemplate() {
    const title = createTitle.trim();
    if (!title) {
      setMessage("请输入文件名");
      return;
    }
    if (!activeSpace || !isEditableSpace(activeSpace)) {
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
      router.push(`/docs/editor/templates/${encodeURIComponent(saved.id)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建模板失败");
    } finally {
      setCreating(false);
    }
  }

  const templateColumns = useMemo<DataSurfaceColumnSpec<EditorTemplateListItemDto>[]>(() => [
    {
      key: "title",
      label: "模板",
      cell: (row: EditorTemplateListItemDto) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-slate-900">{row.title}</div>
          <div className="mt-0.5 text-xs text-slate-500">
            {row.stageCount ?? 0} 阶段 · {row.tableCount ?? 0} 表格 · {row.fieldCount ?? 0} 字段 · {row.formulaCount ?? 0} 公式
          </div>
        </div>
      ),
    },
    { key: "type", label: "类型", cell: (row: EditorTemplateListItemDto) => row.type.toUpperCase() },
    {
      key: "status",
      label: "状态",
      cell: (row: EditorTemplateListItemDto) => ({ kind: "badge", label: statusLabel(row.status), tone: statusTone(row.status) }),
    },
    { key: "role", label: "权限", cell: (row: EditorTemplateListItemDto) => roleLabel(row.role) },
    { key: "updatedAt", label: "更新", cell: (row: EditorTemplateListItemDto) => formatDateTime(row.updatedAt) },
  ], []);

  const left = {
    kind: "selector" as const,
    selector: {
      kind: "list" as const,
      title: "模板空间",
      items: filteredSpaces,
      selectedId: activeSpaceId,
      loading,
      loadingText: "加载空间...",
      emptyText: "暂无可用空间",
      getKey: (item: EditorSpaceDto) => item.id,
      onSelect: (item: EditorSpaceDto) => {
        setActiveSpaceId(item.id);
        setActiveTab("templates");
      },
      renderItem: (item: EditorSpaceDto) => ({
        title: item.title,
        subtitle: item.description,
        tone: item.kind === "personal" ? "blue" as const : item.kind === "company" ? "slate" as const : "emerald" as const,
        meta: [
          roleLabel(item.role),
          businessSpaceKindLabel(item.kind, "docsTemplate"),
        ],
      }),
    },
  };
  const spaceKindOptions = docsSpaceKindOptions(spaces);
  const viewOptions = canManageSpace
    ? DOCS_EDITOR_VIEW_OPTIONS
    : DOCS_EDITOR_VIEW_OPTIONS.filter((option) => option.key !== "permissions");

  const templateListSection = createSectionSection("docs-editor-list", {
    title: activeSpace ? activeSpace.title : "模板列表",
    actions: [
      { key: "create", icon: "create" as const, label: "新增", variant: "primary" as const, onClick: () => setCreateOpen((open) => !open), disabled: loading || !canCreateTemplate },
      { key: "reload", label: "刷新", onClick: () => loadBootstrap(activeSpaceId), disabled: loading },
    ],
    sections: [
      ...(message ? [createMessageSection("docs-editor-list-message", { content: message, tone: "danger" as const })] : []),
      ...(createOpen ? [createEmptySection("docs-editor-create-template", {
        presentation: "plain",
        content: (
          <form
            className="flex flex-wrap items-end gap-3 rounded-md border border-emerald-100 bg-emerald-50/40 p-3 text-slate-900"
            onSubmit={(event) => {
              event.preventDefault();
              void createTemplate();
            }}
          >
            <label className="min-w-64 flex-1 space-y-1">
              <span className="block text-xs font-medium text-slate-500">文件名</span>
              <InputSurface
                spec={{ valueType: "string", control: "text", validation: { required: true } }}
                value={createTitle}
                placeholder="请输入文件名"
                density="compact"
                onChange={(value) => setCreateTitle(String(value ?? ""))}
              />
            </label>
            <button
              type="submit"
              disabled={creating || !createTitle.trim()}
              className="inline-flex h-10 items-center rounded-md bg-emerald-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:bg-slate-300"
            >
              {creating ? "创建中..." : "创建"}
            </button>
            <button
              type="button"
              disabled={creating}
              className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:text-slate-300"
              onClick={() => {
                setCreateOpen(false);
                setCreateTitle("");
              }}
            >
              取消
            </button>
          </form>
        ),
      })] : []),
      createPageDataSection("template-table", {
        kind: "table",
        rows: templates,
        columns: templateColumns,
        visibleColumns: templateColumns.map((column) => column.key),
        loading,
        emptyText: "暂无模板",
        rowKey: (row: EditorTemplateListItemDto) => row.id,
        onRowClick: (row: EditorTemplateListItemDto) => router.push(`/docs/editor/templates/${encodeURIComponent(row.id)}`),
        presentation: { density: "compact", rowHover: "interactive" },
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
    activeTab === "permissions" ? permissionSection : templateListSection,
  ]);

  return (
    <PageSurface
      kind="standard"
      navigation={activeSpace && spaceKindOptions.length > 0 ? createSpaceKindNavigation({
        items: spaceKindOptions,
        active: activeSpace.kind,
        onChange: (kind) => {
          const next = spaces.find((space) => space.kind === kind);
          if (next) setActiveSpaceId(next.id);
          setActiveTab("templates");
        },
        ariaLabel: "模板空间类型",
      }) : undefined}
      toolbar={activeSpace ? {
        items: [
          { kind: "panel-toggle", key: "mobile-side-toggle", icon: "panel-open", label: "显示模板空间", visibility: "mobile", onClick: () => setDrawerOpen(true) },
          { kind: "panel-toggle", key: "desktop-side-toggle", icon: sideOpen ? "panel-open" : "panel-close", label: `${sideOpen ? "隐藏" : "显示"}模板空间`, variant: sideOpen ? "primary" : "secondary", visibility: "desktop", onClick: () => setSideOpen(!sideOpen) },
          createSpaceViewToolbarItem({
            key: "docs-editor-view",
            value: activeTab,
            options: viewOptions,
            onChange: setActiveTab,
            ariaLabel: "模板编辑器视图",
          }),
        ],
      } : undefined}
      body={createSpaceWorkbenchBody({
        left,
        right,
        label: activeSpace?.title ?? "模板空间",
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

const DOCS_EDITOR_VIEW_OPTIONS: SpaceWorkbenchKindOption[] = [
  { key: "templates", label: "文档模板" },
  { key: "permissions", label: "权限管理" },
];

function docsSpaceKindOptions(spaces: EditorSpaceDto[]): SpaceWorkbenchKindOption[] {
  const kinds = new Set(spaces.map((space) => space.kind));
  return [
    { key: "personal", label: "个人" },
    { key: "company", label: "公共" },
    { key: "department", label: "部门" },
  ].filter((option) => kinds.has(option.key as EditorSpaceDto["kind"]));
}
