"use client";

import { PageSurface, type PageSurfaceBlockSpec } from "@workspace/core/ui";
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
  return {
    kind: "panel",
    key: "template-editor",
    className: "mb-4",
    bodyClassName: "p-3",
    blocks: [
      {
        kind: "form",
        key: "template-name",
        surface: {
          kind: "inline",
          fields: [{
            key: "name",
            label: "模板名称",
            spec: { valueType: "string", control: "text" },
            value: name,
            onChange: (value) => onNameChange(String(value ?? "")),
          }],
          actions: [
            { key: "save", label: "保存模板", variant: "primary", onClick: () => void onSave() },
            { key: "cancel", label: "取消", onClick: onCancel },
          ],
        },
      },
      {
        kind: "surfaceGroup",
        key: "field-groups",
        layout: "grid",
        className: "md:grid-cols-2",
        blocks: POSITION_DESCRIPTION_TEMPLATE_FIELD_GROUPS.map((group) => ({
          kind: "panel",
          key: group.label,
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
      },
    ],
  };
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
    blocks={[buildPositionDescriptionTemplateEditorBlock({ name, fields, onNameChange, onToggleField, onSave, onCancel })]}
  />;
}
