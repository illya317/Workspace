"use client";

import { CreatePanel, FormField } from "@workspace/core/ui";
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

  return (
    <CreatePanel
      variant="inline"
      title={`新建${config.title}`}
      onSubmit={onSubmit}
      onCancel={onCancel}
      submitDisabled={requiredFields.some((field) => !String(createForm[field.key] ?? "").trim())}
    >
      {requiredFields.map((field) => (
        <FormField
          key={field.key}
          label={field.label}
          required
          className={field.type === "textarea" ? "w-72 max-w-full" : "w-64 max-w-full"}
        >
          <GenericFieldInput
            field={field}
            value={createForm[field.key]}
            onChange={(value) => onChange(field.key, value)}
            fkConfig={config.fkFields?.[field.key]}
            mode="create"
            className="border-gray-300 focus:border-emerald-400"
          />
        </FormField>
      ))}
    </CreatePanel>
  );
}
