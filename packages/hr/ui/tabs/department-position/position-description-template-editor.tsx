"use client";

import { CommandButton, FormField, InputControl, PanelCard } from "@workspace/core/ui";
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
  return <PanelCard className="mb-4" bodyClassName="p-3">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <FormField label="模板名称">
          <InputControl spec={{ valueType: "string", editor: "input" }} value={name} onChange={(value) => onNameChange(String(value ?? ""))} />
        </FormField>
        <div className="flex gap-2">
          <CommandButton variant="primary" onClick={() => void onSave()}>保存模板</CommandButton>
          <CommandButton onClick={onCancel}>取消</CommandButton>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {POSITION_DESCRIPTION_TEMPLATE_FIELD_GROUPS.map(group => <PanelCard key={group.label} bodyClassName="p-3">
            <div className="mb-2 text-xs font-semibold text-slate-600">{group.label}</div>
            <div className="flex flex-wrap gap-2">
              {group.fields.map(field => <label key={field} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
                  <InputControl spec={{ valueType: "boolean", editor: "checkbox" }} value={fields.includes(field)} onChange={() => onToggleField(field)} />
                  <span>{DETAIL_FIELD_LABELS[field] || field}</span>
                </label>)}
            </div>
          </PanelCard>)}
      </div>
    </PanelCard>;
}
