"use client";

import {
  ActionButton,
  CheckboxChip,
  FormField,
  PanelCard,
  TextField,
} from "@workspace/core/ui";
import {
  DETAIL_FIELD_LABELS,
  POSITION_DESCRIPTION_TEMPLATE_FIELD_GROUPS,
} from "./description-details";
import { formInputClassName } from "./detail-editors";

export function PositionDescriptionTemplateEditor({
  name,
  fields,
  onNameChange,
  onToggleField,
  onSave,
  onCancel,
}: {
  name: string;
  fields: string[];
  onNameChange: (name: string) => void;
  onToggleField: (field: string) => void;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
}) {
  return (
    <PanelCard className="mb-4" bodyClassName="p-3">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <FormField label="模板名称" className="min-w-64 flex-1">
          <TextField value={name} onChange={onNameChange} className={formInputClassName} />
        </FormField>
        <div className="flex gap-2">
          <ActionButton onClick={() => void onSave()} variant="primary">保存模板</ActionButton>
          <ActionButton onClick={onCancel}>取消</ActionButton>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {POSITION_DESCRIPTION_TEMPLATE_FIELD_GROUPS.map((group) => (
          <PanelCard key={group.label} bodyClassName="p-3">
            <div className="mb-2 text-xs font-semibold text-slate-600">{group.label}</div>
            <div className="flex flex-wrap gap-2">
              {group.fields.map((field) => (
                <CheckboxChip
                  key={field}
                  checked={fields.includes(field)}
                  ariaLabel={DETAIL_FIELD_LABELS[field] || field}
                  onChange={() => onToggleField(field)}
                >
                  {DETAIL_FIELD_LABELS[field] || field}
                </CheckboxChip>
              ))}
            </div>
          </PanelCard>
        ))}
      </div>
    </PanelCard>
  );
}
