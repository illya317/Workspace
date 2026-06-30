"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createBodySplitSection,
  createPageBody,
  createPageDataSection,
  createPageTabsNavigation,
  createSectionSection,
  PageSurface,
  type BodySurfaceCommandSpec,
  type DataSurfaceColumnSpec,
} from "@workspace/core/ui";
import {
  createEmptyEditorDocument,
  exportEditorDocumentToDocxBlob,
  type EditorDocument,
  type FieldModel,
} from "@workspace/platform/document-editor";
import {
  copyEditorTemplate,
  createEditorTemplateDraft,
  fetchEditorBootstrap,
  fetchEditorTemplate,
  markEditorTemplatePublished,
  requestEditorTemplatePublish,
  saveEditorTemplateDraft,
  updateEditorTemplatePermissions,
  type EditorPermissionRole,
  type EditorSpaceDto,
  type EditorTemplateDetailDto,
  type EditorTemplateListItemDto,
} from "./api";
import { createEditorDetailSection } from "./sections";
import {
  GENERATED_QC_SPACE_ID,
  canEdit,
  canManage,
  evaluateFieldModel,
  fieldRows,
  formatDateTime,
  isEditableSpace,
  isGeneratedTemplate,
  normalizeEditorDocument,
  normalizeFieldModel,
  roleLabel,
  statusLabel,
  statusTone,
  upsertFormula,
  type FieldFormulaRow,
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

export default function DocsEditorWorkbench() {
  const [spaces, setSpaces] = useState<EditorSpaceDto[]>([]);
  const [templates, setTemplates] = useState<EditorTemplateListItemDto[]>([]);
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("paper");
  const [detail, setDetail] = useState<EditorTemplateDetailDto | null>(null);
  const [documentDraft, setDocumentDraft] = useState<EditorDocument>(() => createEmptyEditorDocument());
  const [fieldModelDraft, setFieldModelDraft] = useState<FieldModel>(() => ({ schemaVersion: 1, fields: {}, formulas: {} }));
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [grantUserId, setGrantUserId] = useState("");
  const [grantRole, setGrantRole] = useState<EditorPermissionRole>("viewer");
  const [sideOpen, setSideOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadBootstrap = useCallback(async (spaceId: string | null) => {
    setLoading(true);
    try {
      const data = await fetchEditorBootstrap(spaceId ?? undefined);
      setSpaces(data.spaces);
      setTemplates(data.templates);
      setActiveSpaceId((current) => current ?? data.spaces[0]?.id ?? null);
      setActiveTemplateId((current) => (
        current && data.templates.some((template) => template.id === current)
          ? current
          : data.templates[0]?.id ?? null
      ));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载模板编辑器失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBootstrap(activeSpaceId);
  }, [activeSpaceId, loadBootstrap]);

  useEffect(() => {
    if (!activeTemplateId) {
      setDetail(null);
      setDocumentDraft(createEmptyEditorDocument());
      setFieldModelDraft({ schemaVersion: 1, fields: {}, formulas: {} });
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    fetchEditorTemplate(activeTemplateId)
      .then((next) => {
        if (cancelled) return;
        setDetail(next);
        setDocumentDraft(normalizeEditorDocument(next));
        setFieldModelDraft(normalizeFieldModel(next.fieldModel));
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "加载模板详情失败");
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTemplateId]);

  const activeSpace = spaces.find((space) => space.id === activeSpaceId) ?? spaces[0] ?? null;
  const selectedTemplate = templates.find((template) => template.id === activeTemplateId) ?? null;
  const editableTargetSpace = spaces.find(isEditableSpace) ?? null;
  const formulaComputation = useMemo(() => evaluateFieldModel(fieldModelDraft), [fieldModelDraft]);
  const formulaRows = useMemo(() => fieldRows(fieldModelDraft, formulaComputation), [fieldModelDraft, formulaComputation]);

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

  const fieldColumns = useMemo<DataSurfaceColumnSpec<FieldFormulaRow>[]>(() => [
    {
      key: "label",
      label: "字段",
      cell: (row: FieldFormulaRow) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-slate-900">{row.label}</div>
          <div className="mt-0.5 truncate text-xs text-slate-500">{row.key}</div>
        </div>
      ),
    },
    { key: "type", label: "类型", cell: (row: FieldFormulaRow) => row.type },
    { key: "unit", label: "单位", cell: (row: FieldFormulaRow) => row.unit || "-" },
    { key: "mode", label: "模式", cell: (row: FieldFormulaRow) => row.mode },
    { key: "computedValue", label: "计算", cell: (row: FieldFormulaRow) => row.error ? ({ kind: "badge", label: "错误", tone: "red" }) : row.computedValue },
    { key: "error", label: "错误提示", cell: (row: FieldFormulaRow) => row.error || "-" },
    {
      key: "formula",
      label: "公式/引用",
      cell: (row: FieldFormulaRow) => (
        <input
          className="h-8 w-full rounded border border-slate-200 bg-white px-2 font-mono text-xs text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
          value={row.formula}
          placeholder="例如 ROUND(field_a * field_b, 2)"
          onChange={(event) => setFieldModelDraft((current) => upsertFormula(current, row.key, event.target.value))}
        />
      ),
    },
  ], []);

  const permissionColumns = useMemo<DataSurfaceColumnSpec<EditorTemplateDetailDto["permissions"][number]>[]>(() => [
    { key: "userName", label: "用户", cell: (row: EditorTemplateDetailDto["permissions"][number]) => row.userName },
    { key: "userId", label: "用户ID", cell: (row: EditorTemplateDetailDto["permissions"][number]) => row.userId },
    { key: "role", label: "授权", cell: (row: EditorTemplateDetailDto["permissions"][number]) => roleLabel(row.role) },
  ], []);

  async function saveDraft() {
    if (!detail) return;
    setBusy("save");
    setMessage(null);
    try {
      const sourceStageKeys = Array.isArray(detail.document && (detail.document as { metadata?: { sourceStageKeys?: unknown } }).metadata?.sourceStageKeys)
        ? (detail.document as { metadata: { sourceStageKeys: string[] } }).metadata.sourceStageKeys
        : ["intermediate", "packaging", "finished"];
      const saved = isGeneratedTemplate(detail.id)
        ? await createEditorTemplateDraft({
          spaceId: editableTargetSpace?.id,
          title: detail.title,
          type: detail.type,
          document: documentDraft,
          fieldModel: fieldModelDraft,
          sourceKind: detail.sourceKind,
          sourceProductKey: detail.sourceProductKey,
          sourceStageKeys,
        })
        : await saveEditorTemplateDraft(detail.id, {
          title: detail.title,
          document: documentDraft,
          fieldModel: fieldModelDraft,
        });
      setDetail(saved);
      setDocumentDraft(normalizeEditorDocument(saved));
      setFieldModelDraft(normalizeFieldModel(saved.fieldModel));
      setActiveSpaceId(saved.spaceId);
      setActiveTemplateId(saved.id);
      setMessage(isGeneratedTemplate(detail.id) ? "已复制到可编辑空间并保存草稿" : "草稿已保存");
      await loadBootstrap(saved.spaceId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(null);
    }
  }

  async function copyTemplate() {
    if (!detail) return;
    if (!editableTargetSpace) {
      setMessage("没有可写入的个人或部门空间");
      return;
    }
    setBusy("copy");
    setMessage(null);
    try {
      const copied = await copyEditorTemplate(detail.id, {
        targetSpaceId: editableTargetSpace.id,
        title: `${detail.title} 副本`,
      });
      setActiveSpaceId(copied.spaceId);
      setActiveTemplateId(copied.id);
      setMessage("模板已复制");
      await loadBootstrap(copied.spaceId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "复制失败");
    } finally {
      setBusy(null);
    }
  }

  async function publishRequest() {
    if (!detail || isGeneratedTemplate(detail.id)) return;
    setBusy("publish-request");
    setMessage(null);
    try {
      const next = await requestEditorTemplatePublish(detail.id);
      setDetail(next);
      setMessage("已提交发布申请");
      await loadBootstrap(next.spaceId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "提交发布失败");
    } finally {
      setBusy(null);
    }
  }

  async function publishOfficial() {
    if (!detail || isGeneratedTemplate(detail.id)) return;
    setBusy("publish");
    setMessage(null);
    try {
      const next = await markEditorTemplatePublished(detail.id, { official: detail.sourceKind?.includes("qc") });
      setDetail(next);
      setMessage("模板已发布");
      await loadBootstrap(next.spaceId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "发布失败");
    } finally {
      setBusy(null);
    }
  }

  async function savePermissions(nextPermissions: Array<{ userId: number; role: EditorPermissionRole }>) {
    if (!detail || isGeneratedTemplate(detail.id) || !canManage(detail.role)) return;
    setBusy("permissions");
    setMessage(null);
    try {
      const next = await updateEditorTemplatePermissions(detail.id, nextPermissions);
      setDetail(next);
      setMessage("模版权限已更新");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新模版权限失败");
    } finally {
      setBusy(null);
    }
  }

  async function addPermissionGrant() {
    if (!detail) return;
    const userId = Number(grantUserId);
    if (!Number.isInteger(userId) || userId <= 0) {
      setMessage("请输入有效用户 ID");
      return;
    }
    const retained = detail.permissions
      .filter((permission) => permission.userId !== userId)
      .map((permission) => ({ userId: permission.userId, role: permission.role }));
    await savePermissions([...retained, { userId, role: grantRole }]);
    setGrantUserId("");
  }

  async function removePermissionGrant(userId: number) {
    if (!detail) return;
    await savePermissions(detail.permissions
      .filter((permission) => permission.userId !== userId)
      .map((permission) => ({ userId: permission.userId, role: permission.role })));
  }

  async function exportDocx() {
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

  const detailActions: BodySurfaceCommandSpec[] = [
    {
      key: "save",
      label: isGeneratedTemplate(detail?.id ?? null) ? "复制并保存" : "保存草稿",
      variant: "primary",
      onClick: saveDraft,
      disabled: !detail || busy === "save" || (!canEdit(detail.role) && !isGeneratedTemplate(detail.id)),
    },
    {
      key: "copy",
      label: "复制模板",
      onClick: copyTemplate,
      disabled: !detail || busy === "copy" || !editableTargetSpace,
    },
    {
      key: "export",
      label: "导出 DOCX",
      onClick: exportDocx,
      disabled: !detail || busy === "export",
    },
  ];

  const left = {
    kind: "selector" as const,
    selector: {
      kind: "list" as const,
      title: "模板空间",
      items: spaces,
      selectedId: activeSpaceId,
      loading,
      loadingText: "加载空间...",
      emptyText: "暂无可用空间",
      getKey: (item: EditorSpaceDto) => item.id,
      onSelect: (item: EditorSpaceDto) => setActiveSpaceId(item.id),
      renderItem: (item: EditorSpaceDto) => ({
        title: item.title,
        subtitle: item.description,
        tone: item.kind === "personal" ? "blue" as const : "emerald" as const,
        meta: [roleLabel(item.role), item.kind === "personal" ? "个人" : "部门"],
        status: item.id === GENERATED_QC_SPACE_ID ? { label: "官方", tone: "success" as const } : undefined,
      }),
    },
  };

  const right = createPageBody([
    createSectionSection("docs-editor-list", {
      title: activeSpace ? activeSpace.title : "模板列表",
      subtitle: "选择模板后可编辑纸面、字段公式、权限和发布状态。",
      actions: [{ key: "reload", label: "刷新", onClick: () => loadBootstrap(activeSpaceId), disabled: loading }],
      sections: [
        createPageDataSection("template-table", {
          kind: "table",
          rows: templates,
          columns: templateColumns,
          visibleColumns: templateColumns.map((column) => column.key),
          loading,
          emptyText: "暂无模板",
          rowKey: (row: EditorTemplateListItemDto) => row.id,
          onRowClick: (row: EditorTemplateListItemDto) => setActiveTemplateId(row.id),
          rowState: (row: EditorTemplateListItemDto) => row.id === activeTemplateId ? "selected" : "normal",
          presentation: { density: "compact", rowHover: "interactive" },
        }),
      ],
    }),
    createEditorDetailSection({
      activeTab,
      detail,
      detailActions,
      detailLoading,
      documentDraft,
      fieldColumns,
      fieldModelDraft,
      formulaRows,
      formulaComputation,
      message,
      permissionColumns,
      selectedTemplate,
      setFieldModelDraft,
      setDocumentDraft,
      publishRequest,
      publishOfficial,
      grantRole,
      grantUserId,
      setGrantRole,
      setGrantUserId,
      addPermissionGrant,
      removePermissionGrant,
      busy,
    }),
  ]);

  return (
    <PageSurface
      kind="standard"
      navigation={createPageTabsNavigation({
        items: [
          { key: "paper", label: "纸面编辑" },
          { key: "fields", label: "字段/公式" },
          { key: "permissions", label: "权限/发布" },
        ],
        active: activeTab,
        onChange: setActiveTab,
        ariaLabel: "模板编辑器视图",
      })}
      body={createBodySplitSection({
        left,
        right,
        side: {
          label: activeSpace?.title ?? "模板空间",
          open: sideOpen,
          drawerOpen,
          onOpenChange: setSideOpen,
          onDrawerOpenChange: setDrawerOpen,
          showControls: true,
        },
        layout: { ratio: [0.28, 0.72] },
      })}
    />
  );
}
