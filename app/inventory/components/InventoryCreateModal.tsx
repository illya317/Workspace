"use client";

import { DetailModal, SelectField } from "@workspace/core/ui";

interface CreateFieldConfig {
  key: string;
  label: string;
  type: "text" | "select";
  options?: string[];
  required?: boolean;
  span?: "full" | "half";
  defaultValue?: string;
}

interface InventoryCreateModalProps {
  open: boolean;
  title: string;
  fields: CreateFieldConfig[];
  form: Record<string, unknown>;
  onFieldChange: (key: string, value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export default function InventoryCreateModal({
  open, title, fields, form, onFieldChange, onSave, onCancel,
}: InventoryCreateModalProps) {
  if (!open) return null;
  return (
    <DetailModal open title={title} onClose={onCancel}>
        <div className="grid grid-cols-2 gap-3">
          {fields.map((f) => (
            <div key={f.key} className={f.span === "full" ? "col-span-2" : ""}>
              <label className="text-xs text-gray-600">
                {f.label}{f.required && <span className="ml-0.5 text-red-400">*</span>}
              </label>
              {f.type === "select" ? (
                <SelectField
                  value={(form[f.key] as string) ?? f.defaultValue ?? ""}
                  onChange={(value) => onFieldChange(f.key, value)}
                  options={(f.options ?? []).map((option) => ({ value: option, label: option }))}
                  selectClassName="min-h-7"
                />
              ) : (
                <input
                  value={(form[f.key] as string) ?? ""}
                  onChange={(e) => onFieldChange(f.key, e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                />
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={onSave} className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700">
            保存
          </button>
          <button onClick={onCancel} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            取消
          </button>
        </div>
    </DetailModal>
  );
}
