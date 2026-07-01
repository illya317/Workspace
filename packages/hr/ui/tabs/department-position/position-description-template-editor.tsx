"use client";

import { createActionsSection, createPageBody, PageSurface, createSectionsSection, createPanelSection, type BodySurfaceSectionSpec } from "@workspace/core/ui";
import { DETAIL_FIELD_LABELS, POSITION_DESCRIPTION_TEMPLATE_FIELD_GROUPS } from "./description-details";

type PositionDescriptionTemplateEditorProps = {
  name: string;
  fields: string[];
  onNameChange: (name: string) => void;
  onToggleField: (field: string) => void;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
};

export function createPositionDescriptionTemplateEditorSection({
  name,
  fields,
  onNameChange,
  onToggleField,
  onSave,
  onCancel,
}: PositionDescriptionTemplateEditorProps): BodySurfaceSectionSpec {
  return createPanelSection("template-editor", {

    title: "模板名称",
    sections: [
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
      createActionsSection("template-editor-actions", [
        { key: "cancel", label: "取消", icon: "cancel", onClick: onCancel },
        { key: "save", label: "保存模板", icon: "save", variant: "primary", onClick: () => void onSave() },
      ]),
    ],
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
    body={createPageBody([createPositionDescriptionTemplateEditorSection({ name, fields, onNameChange, onToggleField, onSave, onCancel })])}
  />;
}
