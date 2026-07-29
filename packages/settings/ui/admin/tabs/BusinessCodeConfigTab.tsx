"use client";
import { useCallback, useEffect, useState } from "react";
import {
  createEmptySection,
  createFieldsSection,
  createMasterDetailBody,
  createPageBody,
  createStatusSection,
  useFeedback,
  type BodySurfaceSectionSpec,
  type BodySurfaceProps,
  type CreateSurfaceToolbarProps,
  type SelectorSurfaceProps,
  type SurfaceToolbarItem,
} from "@workspace/core/ui";
import type { BusinessCodeConfig } from "@workspace/platform/business-code-config";
import {
  createBusinessCodeTemplate,
  deleteBusinessCodeTemplate,
  selectBusinessCodeTemplate,
  updateBusinessCodeTemplate,
} from "@workspace/platform/business-code-management";
import {
  BUSINESS_CODE_SYSTEM_TEMPLATES,
  type BusinessCodeObjectKey,
} from "@workspace/platform/business-code-registry";
import {
  businessCodeTemplateSummary,
  defaultBusinessCodeTemplateSettings,
} from "@workspace/platform/business-code-template";
import { putJson, requestJson } from "@workspace/platform/ui/api-client";
import {
  businessCodeTemplateDraftError,
  businessCodeTemplateEditorItems,
  emptyBusinessCodeTemplateDraft,
  type BusinessCodeTemplateDraft,
} from "./BusinessCodeTemplateEditor";
import {
  createBusinessCodeTemplateApplicationsSection,
  type BusinessCodeApplicationEditor,
} from "./BusinessCodeTemplateApplications";
type SystemConfigResponse = { businessCodeConfig: BusinessCodeConfig };
type UseBusinessCodeConfigTabInput = { enabled: boolean; showToast: (message: string, type?: "success" | "error") => void };
type BusinessCodeConfigTabState = { body: BodySurfaceProps; toolbarItems: SurfaceToolbarItem[] };
type TemplateSelection = {
  kind: "system" | "custom";
  key: string;
  name: string;
  description: string;
  example: string;
  draft: BusinessCodeTemplateDraft;
};
export function useBusinessCodeConfigTab({
  enabled,
  showToast,
}: UseBusinessCodeConfigTabInput): BusinessCodeConfigTabState {
  const feedback = useFeedback();
  const [draft, setDraft] = useState<BusinessCodeConfig | null>(null);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>("system.sequential");
  const [templateDetailOpen, setTemplateDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<BusinessCodeTemplateDraft>(() => emptyBusinessCodeTemplateDraft());
  const [editDraft, setEditDraft] = useState<BusinessCodeTemplateDraft | null>(null);
  const [applicationEditor, setApplicationEditor] = useState<BusinessCodeApplicationEditor | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await requestJson<SystemConfigResponse>(
        "/api/settings/admin/system-config",
        { fallbackMessage: "加载编码配置失败" },
      );
      setDraft(response.businessCodeConfig);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "加载编码配置失败", "error");
    } finally {
      setLoading(false);
      setAttempted(true);
    }
  }, [showToast]);

  useEffect(() => {
    if (!enabled || attempted || loading) return;
    void load();
  }, [attempted, enabled, load, loading]);

  const persistConfig = useCallback(async (next: BusinessCodeConfig) => {
    setSaving(true);
    try {
      await putJson(
        "/api/settings/admin/system-config",
        { businessCodeConfig: next },
        "保存编码配置失败",
      );
      setDraft(next);
    } finally {
      setSaving(false);
    }
  }, []);

  const toolbarItems: SurfaceToolbarItem[] = [];

  if (!draft) {
    return {
      toolbarItems,
      body: createPageBody([
        createStatusSection("business-code-config-status", {
          kind: loading ? "loading" : "error",
          content: loading ? "正在加载编码配置..." : "编码配置加载失败",
        }),
      ]),
    };
  }

  async function saveTemplateAssignment(key: BusinessCodeObjectKey, templateKey: string) {
    try {
      const next = selectBusinessCodeTemplate(draft, key, templateKey);
      await persistConfig(next);
      showToast("编码对象关联已保存", "success");
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "保存编码对象关联失败", "error");
      return false;
    }
  }

  const templateSelections: TemplateSelection[] = [
    ...BUSINESS_CODE_SYSTEM_TEMPLATES.map((template) => ({
      kind: "system" as const,
      key: template.key,
      name: template.label,
      description: template.description,
      example: template.example,
      draft: {
        name: template.label,
        settings: defaultBusinessCodeTemplateSettings(template.key),
      },
    })),
    ...draft.management.templates.map((template) => ({
      kind: "custom" as const,
      key: template.key,
      name: template.name,
      description: businessCodeTemplateSummary(template.settings),
      example: template.example,
      draft: {
        key: template.key,
        name: template.name,
        settings: template.settings,
      },
    })),
  ];
  const selectedTemplate = templateSelections.find((template) => template.key === selectedTemplateKey)
    ?? templateSelections[0]
    ?? null;

  const selector: SelectorSurfaceProps<TemplateSelection> = {
    kind: "list",
    title: "编码模板",
    selectedId: selectedTemplate?.key ?? null,
    emptyText: "暂无编码模板",
    items: templateSelections.map((template) => ({
      key: template.key,
      value: template,
      group: template.kind === "system" ? "系统模板" : "自定义模板",
      card: {
        title: template.name,
        code: template.example,
        subtitle: template.description,
        status: {
          label: template.kind === "system" ? "系统" : "自定义",
          tone: template.kind === "system" ? "muted" : "default",
        },
        tone: template.kind === "system" ? "slate" : "blue",
      },
    })),
    onSelect: (template) => {
      setSelectedTemplateKey(template.key);
      setEditDraft(null);
      setCreateOpen(false);
      setApplicationEditor(null);
      setTemplateDetailOpen(true);
    },
  };

  const createTemplateSurface: CreateSurfaceToolbarProps = {
    id: "business-code-template-create",
    trigger: "toolbar",
    presentation: "block",
    title: "新增编码模板",
    open: createOpen,
    canCreate: true,
    disabled: saving,
    content: {
      kind: "form",
      form: {
        layout: { columns: 3, density: "compact" },
        items: businessCodeTemplateEditorItems({
          draft: createDraft,
          onChange: setCreateDraft,
        }),
      },
    },
    submission: {
      action: "save",
      disabled: Boolean(businessCodeTemplateDraftError(createDraft)),
      execute: async () => {
        const next = createBusinessCodeTemplate(draft, createDraft);
        const created = next.management.templates.at(-1);
        await persistConfig(next);
        setSelectedTemplateKey(created?.key ?? "system.sequential");
        setCreateOpen(false);
        setCreateDraft(emptyBusinessCodeTemplateDraft());
        return { outcome: "saved", message: "模板已新增" };
      },
    },
    feedback: { saved: "模板已新增", error: "新增模板失败" },
    onOpenChange: setCreateOpen,
    onCancel: () => {
      setCreateOpen(false);
      setCreateDraft(emptyBusinessCodeTemplateDraft());
    },
  };

  const detailSections: BodySurfaceSectionSpec[] = [
    {
      key: "business-code-template-create",
      body: { kind: "create" as const, create: createTemplateSurface },
    },
  ];

  if (createOpen) {
    // The block editor owns the detail pane while creating; do not stack the selected template below it.
  } else if (!selectedTemplate) {
    detailSections.push(createEmptySection("business-code-template-empty", {
      content: "从左侧选择模板查看规则",
      presentation: "card",
    }));
  } else {
    const editing = selectedTemplate.kind === "custom" && editDraft?.key === selectedTemplate.key;
    const editorDraft = editing && editDraft ? editDraft : selectedTemplate.draft;
    const saveTemplateEdit = async () => {
      try {
        const next = updateBusinessCodeTemplate(draft, {
          ...editorDraft,
          key: editorDraft.key ?? "",
        });
        await persistConfig(next);
        setEditDraft(null);
        showToast("模板已保存", "success");
      } catch (error) {
        showToast(error instanceof Error ? error.message : "更新模板失败", "error");
      }
    };
    detailSections.push(createBusinessCodeTemplateApplicationsSection({
      config: draft,
      templateKey: selectedTemplate.key,
      editor: applicationEditor,
      saving,
      onEditorChange: setApplicationEditor,
      onSubmit: saveTemplateAssignment,
    }));
    detailSections.push(createFieldsSection(
      "business-code-template-detail",
      businessCodeTemplateEditorItems({
        draft: editorDraft,
        onChange: setEditDraft,
        readOnly: !editing,
      }),
      {
        kind: editing ? "fields" : "detail",
        layout: { columns: 3, density: "compact" },
        header: {
          title: selectedTemplate.name,
          description: selectedTemplate.description,
        },
        actions: selectedTemplate.kind === "system"
          ? [{
              key: "copy-business-code-system-template",
              action: "copy",
              label: "复制为自定义模板",
              disabled: saving,
              onClick: () => {
                setCreateDraft({
                  name: `${selectedTemplate.name}副本`,
                  settings: JSON.parse(JSON.stringify(selectedTemplate.draft.settings)),
                });
                setCreateOpen(true);
              },
            }]
          : editing
            ? [
                {
                  key: "cancel-business-code-template-edit",
                  action: "cancel",
                  label: "取消编辑",
                  disabled: saving,
                  onClick: () => setEditDraft(null),
                },
                {
                  key: "save-business-code-template-edit",
                  action: "save",
                  label: saving ? "保存中..." : "保存模板",
                  disabled: saving || Boolean(businessCodeTemplateDraftError(editorDraft)),
                  onClick: () => void saveTemplateEdit(),
                },
              ]
            : [
                {
                  key: "edit-business-code-template",
                  action: "edit",
                  label: "编辑模板",
                  disabled: saving,
                  onClick: () => setEditDraft({ ...selectedTemplate.draft }),
                },
                {
                  key: "delete-business-code-template",
                  action: "delete",
                  label: "删除模板",
                  disabled: saving,
                  onClick: () => {
                    void (async () => {
                      const confirmed = await feedback.confirmDelete({
                        message: `确定删除模板“${selectedTemplate.name}”吗？`,
                      });
                      if (!confirmed) return;
                      try {
                        const next = deleteBusinessCodeTemplate(draft, selectedTemplate.key);
                        await persistConfig(next);
                        setSelectedTemplateKey("system.sequential");
                        setEditDraft(null);
                        showToast("模板已删除", "success");
                      } catch (error) {
                        showToast(error instanceof Error ? error.message : "删除模板失败", "error");
                      }
                    })();
                  },
                },
              ],
        submit: editing ? { onSubmit: () => void saveTemplateEdit() } : undefined,
      },
    ));
  }

  return {
    toolbarItems,
    body: createMasterDetailBody({
      master: {
        label: "编码模板",
        presentation: "compact",
        body: { kind: "selector", selector },
      },
      detail: createPageBody(detailSections),
      desktop: { ratio: [1, 2] },
      mobile: {
        detailActive: templateDetailOpen,
        onNavigateToList: () => setTemplateDetailOpen(false),
      },
    }),
  };
}
