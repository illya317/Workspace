"use client";

import { createPageBody, PageSurface, createCreatePanelSection, createSectionsSection, createPanelSection, type PageSurfaceSectionSpec } from "@workspace/core/ui";
import { DETAIL_FIELD_LABELS, POSITION_DESCRIPTION_TEMPLATE_FIELD_GROUPS } from "./description-details";

type PositionDescriptionTemplateEditorProps = {
  name: string;
  fields: string[];
  onNameChange: (name: string) => void;
  onToggleField: (field: string) => void;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
};

export function buildPositionDescriptionTemplateEditorBlock({
  name,
  fields,
  onNameChange,
  onToggleField,
  onSave,
  onCancel,
}: PositionDescriptionTemplateEditorProps): PageSurfaceSectionSpec {
  return createCreatePanelSection("template-editor", {

    title: "模板名称",
    creating: true,
    canCreate: true,
    submitLabel: "保存模板",
    onStartCreate: () => undefined,
    onSubmit: () => void onSave(),
    onCancel,
    createContent: (
      <PageSurface kind="standard"
        embedded
        body={createPageBody([
          {
            key: "template-name",
            body: { kind: "form", form: {
              kind: "filters",
              content: { items: [{
                key: "name",
                label: "名称",
                spec: { valueType: "string", control: "text" },
                value: name,
                onChange: (value: unknown) => onNameChange(String(value ?? "")),
              }] },
            } },
          },
          createSectionsSection("field-groups", {
            layout: "grid",

            sections: POSITION_DESCRIPTION_TEMPLATE_FIELD_GROUPS.map((group) => createPanelSection(group.label, {
              title: group.label,

              sections: [{
                key: `${group.label}-fields`,
                body: { kind: "form", form: {
                  kind: "filters",
                  content: { items: group.fields.map((field) => ({
                    key: field,
                    label: DETAIL_FIELD_LABELS[field] || field,
                    spec: { valueType: "boolean", control: "boolean", presentation: "checkbox" },
                    value: fields.includes(field),
                    onChange: () => onToggleField(field),
                  })) },
                } },
              }],
            })),
          }),
        ])}
      />
    ),
    children: null,
  });
}

export function PositionDescriptionTemplateEditor({
  name,
  fields,
  onNameChange,
  onToggleField,
  onSave,
  onCancel
}: PositionDescriptionTemplateEditorProps) {
  return <PageSurface kind="standard"
    embedded
    body={createPageBody([buildPositionDescriptionTemplateEditorBlock({ name, fields, onNameChange, onToggleField, onSave, onCancel })])}
  />;
}
