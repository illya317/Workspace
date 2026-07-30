"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import {
  usePageAssistant,
  type PageSurfaceCreateSpec,
  type SurfaceToolbarItems,
} from "@workspace/core/ui";
import type {
  OperationalAnalysisManagedTemplateDTO,
  OperationalAnalysisScopeType,
  OperationalAnalysisTemplateCatalogDTO,
  OperationalAnalysisTemplateDTO,
} from "@workspace/finance/types";

import { useOperationalAnalysisTemplateLifecycle } from "./useOperationalAnalysisTemplateLifecycle";

export const CONFIGURE_OPERATIONAL_ANALYSIS_TEMPLATE_ACTION = "finance.configureOperationalAnalysisTemplate";

type CatalogResponse = {
  success?: boolean;
  data?: OperationalAnalysisTemplateCatalogDTO;
  error?: string;
};

export function useOperationalAnalysisWorkspace(
  scopeType: OperationalAnalysisScopeType,
  scopeId: number,
) {
  const pageAssistant = usePageAssistant();
  const [catalog, setCatalog] = useState<OperationalAnalysisTemplateCatalogDTO | null>(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoPreviewTemplateId, setAutoPreviewTemplateId] = useState<number | null>(null);

  const loadCatalog = useCallback(async (preferLatestDraft = false) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(workspacePath(
        `/api/modules/finance/cost/operational-analytics/spaces/${scopeType}/${scopeId}/templates`,
      ));
      const body = await response.json() as CatalogResponse;
      if (!response.ok || !body.success || !body.data) {
        throw new Error(body.error || "经营分析模板加载失败");
      }
      setCatalog(body.data);
      const latestDraft = preferLatestDraft
        ? [...body.data.managedTemplates]
            .filter((template) => template.status === "active" && template.hasDraft)
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
        : null;
      setSelectedKey((current) => latestDraft
        ? selectionKeyForManagedTemplate(body.data!, latestDraft)
        : normalizeSelectedKey(body.data!, current));
      setAutoPreviewTemplateId(latestDraft?.id ?? null);
    } catch (cause) {
      setCatalog(null);
      setError(cause instanceof Error ? cause.message : "经营分析模板加载失败");
    } finally {
      setLoading(false);
    }
  }, [scopeId, scopeType]);

  useEffect(() => { void loadCatalog(); }, [loadCatalog]);
  useEffect(() => {
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent<{ actionKey?: string }>).detail;
      if (detail?.actionKey === CONFIGURE_OPERATIONAL_ANALYSIS_TEMPLATE_ACTION) void loadCatalog(true);
    };
    window.addEventListener("workspace:agent-proposal-confirmed", refresh);
    return () => window.removeEventListener("workspace:agent-proposal-confirmed", refresh);
  }, [loadCatalog]);

  const selectedTemplate = useMemo(
    () => catalog?.templates.find((template) => template.key === selectedKey) ?? null,
    [catalog, selectedKey],
  );
  const selectedManagedTemplate = useMemo(() => {
    const id = selectedTemplate?.source === "workspace"
      ? selectedTemplate.id
      : managedTemplateIdFromKey(selectedKey);
    return catalog?.managedTemplates.find((template) => template.id === id) ?? null;
  }, [catalog?.managedTemplates, selectedKey, selectedTemplate]);

  const lifecycle = useOperationalAnalysisTemplateLifecycle({
    scopeType,
    scopeId,
    template: selectedManagedTemplate,
    onChanged: () => loadCatalog(),
  });
  const previewHead = lifecycle.previewHead;
  useEffect(() => {
    if (!autoPreviewTemplateId || selectedManagedTemplate?.id !== autoPreviewTemplateId) return;
    previewHead();
    setAutoPreviewTemplateId(null);
  }, [autoPreviewTemplateId, previewHead, selectedManagedTemplate?.id]);

  const openTemplateAssistant = useCallback(() => {
    const editableTemplate = selectedManagedTemplate?.status === "active" ? selectedManagedTemplate : null;
    const templateContext = editableTemplate
      ? String(editableTemplate.id)
      : "new";
    const selectedName = selectedTemplate?.name ?? selectedManagedTemplate?.name;
    pageAssistant.openAssistant({
      contextLabel: "经营分析模板",
      path: typeof window === "undefined" ? undefined : window.location.pathname,
      title: typeof document === "undefined" ? undefined : document.title,
      emptyTitle: "想做什么经营分析？",
      emptyDescription: selectedTemplate || selectedManagedTemplate
        ? selectedTemplate?.source === "system"
          ? `可以参考系统模板「${selectedTemplate.name}」新建空间模板。请说明业务问题、字段口径、同比环比和图表；页面助手会先发现双方可用的版本化数据源。`
          : selectedManagedTemplate?.status === "archived"
            ? `「${selectedName}」已经归档，请先在“版本与发布”恢复为草稿；也可以说明需求来新建一份模板。`
            : `可以改造当前的「${selectedName}」。页面助手会先读取当前草稿头，再发现双方可用的 sourceKey 和字段；确认后只保存草稿，请说明业务问题、口径、同比环比和图表。`
        : "请说明业务问题、数据字段、同比或环比要求、图表形式和模板名称。页面助手会先发现当前空间可用的数据源和字段，并把不清楚的口径问完整。",
      sourceContext: {
        navigationLabel: "经营分析",
        activeKey: `operational-analysis:configure:${scopeType}:${scopeId}:${templateContext}`,
        activeLabel: selectedName ? `当前模板：${selectedName}` : "新建经营分析模板",
      },
    });
  }, [pageAssistant, scopeId, scopeType, selectedManagedTemplate, selectedTemplate]);

  const templateToolbarItems = useMemo<SurfaceToolbarItems>(() => [{
    kind: "select",
    key: "analysis-template",
    label: "分析模板",
    value: selectedKey || "__empty",
    options: catalog && selectionOptions(catalog).length
      ? selectionOptions(catalog)
      : [{ value: "__empty", label: loading ? "模板加载中" : "暂无模板", disabled: true }],
    onChange: (value) => { if (value !== "__empty") setSelectedKey(value); },
  }], [catalog, loading, selectedKey]);

  const assistantCreate = useMemo<PageSurfaceCreateSpec>(() => ({
        id: "operational-analysis-template",
        title: "经营分析模板",
        presentation: "modal",
        open: false,
        canCreate: true,
        disabled: loading || !catalog?.canConfigure || !pageAssistant.enabled,
        content: { kind: "form", form: { items: [] } },
        submission: { action: "save", disabled: true, execute: () => undefined },
        onOpenChange: (open) => { if (open) openTemplateAssistant(); },
  }), [catalog?.canConfigure, loading, openTemplateAssistant, pageAssistant.enabled]);

  return {
    catalog,
    selectedTemplate,
    selectedManagedTemplate,
    templateToolbarItems,
    lifecycleToolbarItems: lifecycle.toolbarItems,
    lifecycleModalSection: lifecycle.modalSection,
    revisionPreview: lifecycle.preview,
    clearRevisionPreview: lifecycle.clearPreview,
    assistantCreate,
    loading,
    error,
    refetch: loadCatalog,
  };
}

export function workspaceTemplateId(template: OperationalAnalysisTemplateDTO | null) {
  return template?.source === "workspace" ? template.id : null;
}

function managedTemplateIdFromKey(key: string) {
  if (!key.startsWith("managed:")) return null;
  const id = Number(key.slice("managed:".length));
  return Number.isInteger(id) && id > 0 ? id : null;
}

function managedSelectionKey(template: OperationalAnalysisManagedTemplateDTO) {
  return `managed:${template.id}`;
}

function selectionKeyForManagedTemplate(
  catalog: OperationalAnalysisTemplateCatalogDTO,
  template: OperationalAnalysisManagedTemplateDTO,
) {
  return catalog.templates.find((candidate) => candidate.id === template.id)?.key
    ?? managedSelectionKey(template);
}

function normalizeSelectedKey(catalog: OperationalAnalysisTemplateCatalogDTO, current: string) {
  if (catalog.templates.some((template) => template.key === current)) return current;
  const currentId = current.startsWith("workspace:")
    ? Number(current.slice("workspace:".length))
    : managedTemplateIdFromKey(current);
  if (currentId) {
    const published = catalog.templates.find((template) => template.id === currentId);
    if (published) return published.key;
    const managed = catalog.managedTemplates.find((template) => template.id === currentId);
    if (managed) return managedSelectionKey(managed);
  }
  if (catalog.templates[0]) return catalog.templates[0].key;
  const firstManaged = catalog.managedTemplates.find((template) => template.status === "active")
    ?? catalog.managedTemplates[0];
  return firstManaged ? managedSelectionKey(firstManaged) : "";
}

function selectionOptions(catalog: OperationalAnalysisTemplateCatalogDTO) {
  const publishedIds = new Set(catalog.templates.flatMap((template) => template.id === null ? [] : [template.id]));
  const managedById = new Map(catalog.managedTemplates.map((template) => [template.id, template]));
  return [
    ...catalog.templates.map((template) => {
      const managed = template.id === null ? null : managedById.get(template.id);
      return {
        value: template.key,
        label: template.source === "system"
          ? `${template.name} · 系统`
          : managed?.hasDraft
            ? `${template.name} · 已发布 / 有草稿`
            : template.name,
      };
    }),
    ...catalog.managedTemplates
      .filter((template) => !publishedIds.has(template.id))
      .map((template) => ({
        value: managedSelectionKey(template),
        label: template.status === "archived"
          ? `${template.name} · 已归档`
          : `${template.name} · 草稿`,
      })),
  ];
}
