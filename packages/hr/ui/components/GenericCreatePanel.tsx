"use client";

import { PageSurface } from "@workspace/core/ui";
import GenericFieldInput from "./GenericFieldInput";
import type { TabConfig } from "@workspace/hr/types";

interface GenericCreatePanelProps {
  config: TabConfig;
  createForm: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export default function GenericCreatePanel({
  config,
  createForm,
  onChange,
  onSubmit,
  onCancel,
}: GenericCreatePanelProps) {
  const requiredFields = config.fields.filter((field) => field.required && !field.hidden);
  const submitDisabled = requiredFields.some((field) => !String(createForm[field.key] ?? "").trim());

  return (
    <PageSurface
      embedded
      kind="detail"
      blocks={[
        {
          kind: "panel",
          key: "create",
          title: `新建${config.title}`,
          actions: [
            { key: "submit", label: "保存", variant: "primary", disabled: submitDisabled, onClick: onSubmit },
            { key: "cancel", label: "取消", onClick: onCancel },
          ],
          blocks: [
            {
              kind: "moduleView",
              key: "fields",
              view: (
                <div className="flex flex-wrap items-end gap-3">
                  {requiredFields.map((field) => (
                    <div
                      key={field.key}
                      className={field.type === "textarea" ? "w-72 max-w-full" : "w-64 max-w-full"}
                    >
                      <div className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500">
                        <span>{field.label}</span>
                        <span className="text-red-500">*</span>
                      </div>
                      <GenericFieldInput
                        field={field}
                        value={createForm[field.key]}
                        onChange={(value) => onChange(field.key, value)}
                        fkConfig={config.fkFields?.[field.key]}
                        mode="create"
                        className="border-gray-300 focus:border-emerald-400"
                      />
                    </div>
                  ))}
                </div>
              ),
            },
          ],
        },
      ]}
    />
  );
}
