"use client";

import GenericFieldInput from "./GenericFieldInput";
import type { TabConfig } from "../types";

interface GenericCreateModalProps {
  config: TabConfig;
  createForm: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export default function GenericCreateModal({
  config,
  createForm,
  onChange,
  onSubmit,
  onCancel,
}: GenericCreateModalProps) {
  const visibleFields = config.fields.filter((f) => !f.hidden);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-sm font-semibold text-gray-800">新建 {config.title}</h3>
        <div className="grid grid-cols-2 gap-3">
          {visibleFields.map((f) => (
            <div key={f.key} className={f.type === "textarea" ? "col-span-2" : ""}>
              <label className="mb-1 block text-xs text-gray-600">
                {f.label}
                {f.required && <span className="ml-0.5 text-red-400">*</span>}
              </label>
              <GenericFieldInput
                field={f}
                value={createForm[f.key]}
                onChange={(val) => onChange(f.key, val)}
                fkConfig={config.fkFields?.[f.key]}
                mode="create"
                className="border-gray-300 focus:border-emerald-400"
              />
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={onSubmit}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700"
          >
            保存
          </button>
          <button
            onClick={onCancel}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
