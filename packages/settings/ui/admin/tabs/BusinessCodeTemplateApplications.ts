import {
  createFieldsSection,
  type BodySurfaceSectionSpec,
  type FormSurfaceItemSpec,
} from "@workspace/core/ui";
import type { BusinessCodeConfig } from "@workspace/platform/business-code-config";
import {
  businessCodeObjectExample,
  businessCodeTemplateOptions,
  selectedBusinessCodeTemplateKey,
} from "@workspace/platform/business-code-management";
import {
  BUSINESS_CODE_OBJECTS,
  type BusinessCodeObjectKey,
} from "@workspace/platform/business-code-registry";
import { createCategoryDirectItemSection } from "@workspace/platform/ui";

export type BusinessCodeApplicationEditor = {
  mode: "create" | "edit";
  objectKey: BusinessCodeObjectKey | "";
  templateKey: string;
};

type BusinessCodeTemplateApplicationsInput = {
  config: BusinessCodeConfig;
  templateKey: string;
  editor: BusinessCodeApplicationEditor | null;
  saving: boolean;
  onEditorChange: (editor: BusinessCodeApplicationEditor | null) => void;
  onSubmit: (key: BusinessCodeObjectKey, templateKey: string) => Promise<boolean>;
};

export function createBusinessCodeTemplateApplicationsSection(
  input: BusinessCodeTemplateApplicationsInput,
): BodySurfaceSectionSpec {
  const compatible = BUSINESS_CODE_OBJECTS.filter((definition) => businessCodeTemplateOptions(
    input.config,
    definition.key,
  ).some((option) => option.value === input.templateKey));
  const applied = compatible.filter((definition) => (
    selectedBusinessCodeTemplateKey(input.config, definition.key) === input.templateKey
  ));
  const available = compatible.filter((definition) => !applied.includes(definition));
  const editingDefinition = input.editor?.objectKey
    ? BUSINESS_CODE_OBJECTS.find((definition) => definition.key === input.editor?.objectKey)
    : undefined;
  const editorItems: FormSurfaceItemSpec[] = input.editor?.mode === "edit" && editingDefinition
    ? [
        {
          kind: "readonly",
          key: "application-object",
          label: "编码对象",
          value: editingDefinition.label,
        },
        {
          key: "application-template",
          label: "关联模板",
          spec: {
            valueType: "string",
            control: "choice",
            options: {
              source: "static",
              items: businessCodeTemplateOptions(input.config, editingDefinition.key),
              visibleCount: 8,
            },
          },
          value: input.editor.templateKey,
          onChange: (value) => input.onEditorChange({
            ...input.editor!,
            templateKey: String(value ?? ""),
          }),
        },
      ]
    : [{
        key: "application-object",
        label: "编码对象",
        spec: {
          valueType: "string",
          control: "choice",
          options: {
            source: "static",
            items: available.map((definition) => ({ value: definition.key, label: definition.label })),
            visibleCount: 8,
          },
        },
        value: input.editor?.objectKey ?? "",
        onChange: (value) => input.onEditorChange({
          mode: "create",
          objectKey: String(value ?? "") as BusinessCodeObjectKey,
          templateKey: input.templateKey,
        }),
      }];
  const editorSections: BodySurfaceSectionSpec[] = [];
  if (input.editor) {
    const submit = async () => {
      if (!input.editor?.objectKey || !input.editor.templateKey) return;
      if (await input.onSubmit(input.editor.objectKey, input.editor.templateKey)) {
        input.onEditorChange(null);
      }
    };
    editorSections.push(createFieldsSection(
      "business-code-template-application-editor",
      editorItems,
      {
        layout: { columns: 2, density: "compact" },
        header: { title: input.editor.mode === "edit" ? "更改关联模板" : "关联编码对象" },
        actions: [
          {
            key: "cancel-business-code-template-application",
            action: "cancel",
            label: "取消",
            disabled: input.saving,
            onClick: () => input.onEditorChange(null),
          },
          {
            key: "save-business-code-template-application",
            action: "save",
            label: input.saving ? "保存中..." : "保存",
            disabled: input.saving || !input.editor.objectKey || !input.editor.templateKey,
            onClick: () => void submit(),
          },
        ],
        submit: { onSubmit: () => void submit() },
      },
    ));
  }

  return createCategoryDirectItemSection({
    key: "business-code-template-applications",
    title: "关联编码对象",
    ariaLabel: "关联编码对象",
    mode: "action",
    columns: 2,
    options: applied.map((definition) => ({
      value: definition.key,
      label: definition.label,
      code: businessCodeObjectExample(input.config, definition.key),
    })),
    onItemClick: (option) => {
      const definition = applied.find((candidate) => candidate.key === option.value);
      if (!definition) return;
      input.onEditorChange({
        mode: "edit",
        objectKey: definition.key,
        templateKey: selectedBusinessCodeTemplateKey(input.config, definition.key),
      });
    },
    emptyText: "暂无关联编码对象",
    create: available.length > 0 && !input.editor ? {
      id: "business-code-template-application-editor",
      title: "关联编码对象",
      presentation: "row",
      disabled: input.saving,
      onCreate: () => input.onEditorChange({
        mode: "create",
        objectKey: "",
        templateKey: input.templateKey,
      }),
    } : undefined,
    sectionsAfterGrid: editorSections,
  });
}
