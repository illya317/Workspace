"use client";

import { FormSurface, PageSurface } from "@workspace/core/ui";
import { DETAIL_FIELD_LABELS, POSITION_DESCRIPTION_TEMPLATE_FIELD_GROUPS } from "./description-details";
export function PositionDescriptionTemplateEditor({
  name,
  fields,
  onNameChange,
  onToggleField,
  onSave,
  onCancel
}: {
  name: string;
  fields: string[];
  onNameChange: (name: string) => void;
  onToggleField: (field: string) => void;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
}) {
  return <PageSurface
    embedded
    kind="detail"
    blocks={[{
      kind: "panel",
      key: "template-editor",
      className: "mb-4",
      bodyClassName: "p-3",
      blocks: [{
        kind: "moduleView",
        key: "content",
        view: <>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <FormSurface
          kind="inline"
          fields={[{
            key: "name",
            label: "模板名称",
            spec: { valueType: "string", editor: "input" },
            value: name,
            onChange: (value) => onNameChange(String(value ?? "")),
          }]}
        />
        <FormSurface
          kind="inline"
          actions={[
            { key: "save", label: "保存模板", variant: "primary", onClick: () => void onSave() },
            { key: "cancel", label: "取消", onClick: onCancel },
          ]}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {POSITION_DESCRIPTION_TEMPLATE_FIELD_GROUPS.map(group => (
          <PageSurface
            key={group.label}
            embedded
            kind="detail"
            blocks={[{
              kind: "panel",
              key: group.label,
              bodyClassName: "p-3",
              blocks: [{
                kind: "moduleView",
                key: "fields",
                view: <>
                  <div className="mb-2 text-xs font-semibold text-slate-600">{group.label}</div>
                  <div className="flex flex-wrap gap-2">
                    {group.fields.map(field => <label key={field} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
                        <FormSurface kind="control" control={{ kind: "inputControl", spec: { valueType: "boolean", editor: "checkbox" }, value: fields.includes(field), onChange: () => onToggleField(field) }} />
                        <span>{DETAIL_FIELD_LABELS[field] || field}</span>
                      </label>)}
                  </div>
                </>,
              }],
            }]}
          />
        ))}
      </div>
        </>,
      }],
    }]}
  />;
}
