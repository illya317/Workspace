"use client";

import { DetailModal, getToolbarActionClassName } from "@workspace/core/ui";
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
    <DetailModal open title={`新建 ${config.title}`} onClose={onCancel} maxWidth="max-w-lg">
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
            className={getToolbarActionClassName("primary")}
          >
            保存
          </button>
          <button
            onClick={onCancel}
            className={getToolbarActionClassName("secondary")}
          >
            取消
          </button>
        </div>
    </DetailModal>
  );
}
