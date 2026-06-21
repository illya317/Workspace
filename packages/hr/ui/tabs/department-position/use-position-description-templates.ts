import { useEffect, useMemo, useState, type ReactNode } from "react";
import { workspacePath } from "@workspace/core/routing";
import {
  COMMON_POSITION_DESCRIPTION_TEMPLATE,
  NEW_POSITION_DESCRIPTION_TEMPLATE_OPTION,
  isDefaultPositionDescriptionTemplate,
  mergePositionDescriptionTemplates,
  positionDescriptionTemplateFields,
  sanitizePositionDescriptionTemplate,
  type PositionDescriptionTemplate,
  type PositionDescriptionTemplateId,
} from "./description-details";

type ToastSetter = (toast: { message: string; type: "success" | "error" } | null) => void;
type ConfirmDelete = (options?: {
  title?: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDanger?: boolean;
}) => Promise<boolean>;

export function usePositionDescriptionTemplates({
  confirmDelete,
  setToast,
}: {
  confirmDelete: ConfirmDelete;
  setToast: ToastSetter;
}) {
  const [positionDescriptionTemplate, setPositionDescriptionTemplate] = useState<PositionDescriptionTemplateId>("common");
  const [storedPositionDescriptionTemplates, setStoredPositionDescriptionTemplates] = useState<PositionDescriptionTemplate[]>([]);
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [templateEditingId, setTemplateEditingId] = useState<PositionDescriptionTemplateId | null>(null);
  const [templateDraftName, setTemplateDraftName] = useState("");
  const [templateDraftFields, setTemplateDraftFields] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function loadTemplates() {
      try {
        const res = await fetch(workspacePath("/api/hr/position-description-templates"));
        if (!res.ok) return;
        const data = await res.json();
        const templates = Array.isArray(data.templates)
          ? data.templates
            .map((template: unknown) => sanitizePositionDescriptionTemplate(template))
            .filter((template: PositionDescriptionTemplate | null): template is PositionDescriptionTemplate => Boolean(template))
          : [];
        if (!cancelled) setStoredPositionDescriptionTemplates(templates);
      } catch {
        // Template loading is optional; built-in templates are always available.
      }
    }
    void loadTemplates();
    return () => {
      cancelled = true;
    };
  }, []);

  const positionDescriptionTemplates = useMemo(
    () => mergePositionDescriptionTemplates(storedPositionDescriptionTemplates),
    [storedPositionDescriptionTemplates]
  );
  const selectedPositionDescriptionTemplate = useMemo(
    () => positionDescriptionTemplates.find((template) => template.id === positionDescriptionTemplate) || positionDescriptionTemplates[0] || COMMON_POSITION_DESCRIPTION_TEMPLATE,
    [positionDescriptionTemplate, positionDescriptionTemplates]
  );

  useEffect(() => {
    if (positionDescriptionTemplates.length === 0) return;
    if (positionDescriptionTemplates.some((template) => template.id === positionDescriptionTemplate)) return;
    setPositionDescriptionTemplate(positionDescriptionTemplates.find((template) => template.id === "common")?.id || positionDescriptionTemplates[0].id);
  }, [positionDescriptionTemplate, positionDescriptionTemplates]);

  const selectedPositionDescriptionTemplateStored = useMemo(
    () => selectedPositionDescriptionTemplate.id !== "full" && storedPositionDescriptionTemplates.some((template) => template.id === selectedPositionDescriptionTemplate.id),
    [selectedPositionDescriptionTemplate.id, storedPositionDescriptionTemplates]
  );
  const selectedPositionDescriptionTemplateDefault = isDefaultPositionDescriptionTemplate(selectedPositionDescriptionTemplate.id);

  function openPositionDescriptionTemplateEditor() {
    if (selectedPositionDescriptionTemplate.id === "full") return;
    const fields = positionDescriptionTemplateFields(selectedPositionDescriptionTemplate);
    setTemplateEditingId(selectedPositionDescriptionTemplate.id);
    setTemplateDraftName(selectedPositionDescriptionTemplate.label);
    setTemplateDraftFields(fields);
    setTemplateEditorOpen(true);
  }

  function openNewPositionDescriptionTemplateEditor() {
    setTemplateEditingId(null);
    setTemplateDraftName("");
    setTemplateDraftFields(positionDescriptionTemplateFields(selectedPositionDescriptionTemplate));
    setTemplateEditorOpen(true);
  }

  function handlePositionDescriptionTemplateChange(value: string) {
    if (value === NEW_POSITION_DESCRIPTION_TEMPLATE_OPTION) {
      openNewPositionDescriptionTemplateEditor();
      return;
    }
    setPositionDescriptionTemplate(value as PositionDescriptionTemplateId);
    setTemplateEditorOpen(false);
  }

  function togglePositionDescriptionTemplateField(field: string) {
    setTemplateDraftFields((prev) => (
      prev.includes(field)
        ? prev.filter((item) => item !== field)
        : [...prev, field]
    ));
  }

  async function savePositionDescriptionTemplate() {
    if (templateEditingId === "full") {
      setToast({ type: "error", message: "完整模板是系统内置模板，不能编辑" });
      return;
    }
    const label = templateDraftName.trim();
    if (!label) {
      setToast({ type: "error", message: "模板名称不能为空" });
      return;
    }
    if (templateDraftFields.length === 0) {
      setToast({ type: "error", message: "至少选择一个字段" });
      return;
    }
    const id = templateEditingId || nextTemplateId(storedPositionDescriptionTemplates);
    const nextTemplate: PositionDescriptionTemplate = { id, label, groups: [], fields: templateDraftFields, custom: true };
    const nextTemplates = storedPositionDescriptionTemplates.some((template) => template.id === id)
      ? storedPositionDescriptionTemplates.map((template) => template.id === id ? nextTemplate : template)
      : [...storedPositionDescriptionTemplates, nextTemplate];
    await persistTemplates(nextTemplates, "保存模板失败", (templates) => {
      setStoredPositionDescriptionTemplates(templates);
      setPositionDescriptionTemplate(id);
      setTemplateEditorOpen(false);
      setToast({ type: "success", message: "模板已保存" });
    });
  }

  async function deletePositionDescriptionTemplate() {
    if (!selectedPositionDescriptionTemplateStored) {
      setToast({ type: "error", message: "当前模板是系统默认模板，无需恢复" });
      return;
    }
    const isDefaultTemplate = isDefaultPositionDescriptionTemplate(selectedPositionDescriptionTemplate.id);
    const actionLabel = isDefaultTemplate ? "恢复默认" : "删除";
    const actionName = isDefaultTemplate ? "恢复默认模板" : "删除模板";
    const confirmed = await confirmDelete({
      title: actionName,
      message: isDefaultTemplate
        ? `确定将「${selectedPositionDescriptionTemplate.label}」恢复为系统默认模板吗？`
        : `确定删除「${selectedPositionDescriptionTemplate.label}」吗？`,
      confirmLabel: actionLabel,
    });
    if (!confirmed) return;
    const nextTemplates = storedPositionDescriptionTemplates.filter((template) => template.id !== selectedPositionDescriptionTemplate.id);
    const nextSelected = mergePositionDescriptionTemplates(nextTemplates).find((template) => template.id === "common") || mergePositionDescriptionTemplates(nextTemplates)[0];
    await persistTemplates(nextTemplates, `${actionName}失败`, (templates) => {
      setStoredPositionDescriptionTemplates(templates);
      setPositionDescriptionTemplate(nextSelected?.id || "common");
      setTemplateEditorOpen(false);
      setToast({ type: "success", message: isDefaultTemplate ? "模板已恢复默认" : "模板已删除" });
    });
  }

  async function persistTemplates(
    nextTemplates: PositionDescriptionTemplate[],
    fallbackMessage: string,
    onSuccess: (templates: PositionDescriptionTemplate[]) => void,
  ) {
    try {
      const res = await fetch(workspacePath("/api/hr/position-description-templates"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templates: nextTemplates }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || fallbackMessage);
      }
      const data = await res.json();
      const savedTemplates: PositionDescriptionTemplate[] = Array.isArray(data.templates)
        ? data.templates
          .map((template: unknown) => sanitizePositionDescriptionTemplate(template))
          .filter((template: PositionDescriptionTemplate | null): template is PositionDescriptionTemplate => Boolean(template))
        : nextTemplates;
      onSuccess(savedTemplates);
    } catch (err) {
      setToast({ type: "error", message: err instanceof Error ? err.message : fallbackMessage });
    }
  }

  return {
    deletePositionDescriptionTemplate,
    handlePositionDescriptionTemplateChange,
    openPositionDescriptionTemplateEditor,
    positionDescriptionTemplate,
    positionDescriptionTemplates,
    savePositionDescriptionTemplate,
    selectedPositionDescriptionTemplate,
    selectedPositionDescriptionTemplateDefault,
    selectedPositionDescriptionTemplateStored,
    setTemplateDraftName,
    setTemplateEditorOpen,
    templateDraftFields,
    templateDraftName,
    templateEditorOpen,
    togglePositionDescriptionTemplateField,
  };
}

function nextTemplateId(templates: PositionDescriptionTemplate[]) {
  let index = templates.length + 1;
  while (templates.some((template) => template.id === `custom-${index}`)) index += 1;
  return `custom-${index}`;
}
