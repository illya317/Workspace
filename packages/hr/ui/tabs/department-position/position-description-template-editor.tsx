"use client";

import { createPageBody, PageSurface, createCreatePanelBlock, createGroupBlock, createPanelBlock, type PageSurfaceBlockSpec } from "@workspace/core/ui";
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
}: PositionDescriptionTemplateEditorProps): PageSurfaceBlockSpec {
  return createCreatePanelBlock("template-editor", {
    blockClassName: "mb-4",
    title: "模板名称",
    creating: true,
    canCreate: true,
    submitLabel: "保存模板",
    onStartCreate: () => undefined,
    onSubmit: () => void onSave(),
    onCancel,
    createContent: (
      <PageSurface
        embedded
        kind="detail"
        body={createPageBody([
          {
            kind: "form",
            key: "template-name",
            surface: {
              kind: "inline",
              fields: [{
                key: "name",
                label: "名称",
                spec: { valueType: "string", control: "text" },
                value: name,
                onChange: (value) => onNameChange(String(value ?? "")),
              }],
            },
          },
          createGroupBlock("field-groups", {
            layout: "grid",
            className: "md:grid-cols-2",
            blocks: POSITION_DESCRIPTION_TEMPLATE_FIELD_GROUPS.map((group) => createPanelBlock(group.label, {
              title: group.label,
              bodyClassName: "p-3",
              blocks: [{
                kind: "form",
                key: `${group.label}-fields`,
                surface: {
                  kind: "inline",
                  fields: group.fields.map((field) => ({
                    key: field,
                    label: DETAIL_FIELD_LABELS[field] || field,
                    spec: { valueType: "boolean", control: "boolean", presentation: "checkbox" },
                    value: fields.includes(field),
                    onChange: () => onToggleField(field),
                  })),
                },
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
  return <PageSurface
    embedded
    kind="detail"
    body={createPageBody([buildPositionDescriptionTemplateEditorBlock({ name, fields, onNameChange, onToggleField, onSave, onCancel })])}
  />;
}
