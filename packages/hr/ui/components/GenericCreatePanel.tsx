"use client";

import { createPageBody, PageSurface, createCreatePanelSection, type FormSurfaceFieldSpec, type PageSurfaceSectionSpec, type ReferenceOption } from "@workspace/core/ui";
import type { FieldConfig, TabConfig } from "@workspace/hr/types";
import { HR_REFERENCE_OPTIONS_ENDPOINT, fkKeyForEntity } from "../fk-keys";

interface GenericCreatePanelProps {
  config: TabConfig;
  createForm: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function buildGenericCreatePanelBlock({
  config,
  createForm,
  onChange,
  onSubmit,
  onCancel,
}: GenericCreatePanelProps): PageSurfaceSectionSpec {
  const requiredFields = config.fields.filter((field) => field.required && !field.hidden);
  const submitDisabled = requiredFields.some((field) => !String(createForm[field.key] ?? "").trim());
  const fields = requiredFields.map((field) => createFieldSpec(field, config, createForm[field.key], (value) => onChange(field.key, value)));

  return createCreatePanelSection("generic-create", {
    title: `新建${config.title}`,
    creating: true,
    canCreate: true,
    submitDisabled,
    submitLabel: "保存",
    onStartCreate: () => undefined,
    onSubmit,
    onCancel,
    createContent: (
      <PageSurface kind="standard"
        embedded
        body={createPageBody([
          {
            kind: "form",
            key: "fields",
            surface: {
              kind: "inline",
              fields,
            },
          },
        ])}
      />
    ),
    children: null,
  });
}

export default function GenericCreatePanel(props: GenericCreatePanelProps) {
  const block = buildGenericCreatePanelBlock(props);
  return block.kind === "block" && block.surface.kind === "content" ? block.surface.content : null;
}

function createFieldSpec(
  field: FieldConfig,
  config: TabConfig,
  value: unknown,
  onChange: (value: unknown) => void,
): FormSurfaceFieldSpec {
  if (field.type === "fk") {
    const fkConfig = config.fkFields?.[field.key];
    const optionValue = value as { id?: number | string; name?: string } | null | undefined;
    return {
      key: field.key,
      label: field.label,
      required: field.required,
      spec: {
        valueType: "reference",
        control: "reference",
        state: "normal",
        options: {
          source: "remote",
          fkKey: fkKeyForEntity(fkConfig?.entity ?? field.key, fkConfig?.fkKey),
          endpoint: HR_REFERENCE_OPTIONS_ENDPOINT,
          returnField: "id",
        },
      },
      value: optionValue?.id == null ? "" : String(optionValue.id),
      displayValue: optionValue?.name ?? "",
      placeholder: `搜索${field.label}`,
      onChange: (_next, option) => {
        const fkOption = option as ReferenceOption | undefined;
        onChange(fkOption ? { id: fkOption.id, name: fkOption.name, subtitle: fkOption.subtitle } : null);
      },
    };
  }

  if (field.type === "boolean") {
    return {
      key: field.key,
      label: field.label,
      required: field.required,
      spec: { valueType: "boolean", control: "boolean", presentation: "checkbox" },
      value: Boolean(value),
      onChange: (next) => onChange(Boolean(next)),
    };
  }

  if (field.type === "date") {
    return {
      key: field.key,
      label: field.label,
      required: field.required,
      spec: { valueType: "date", control: "temporal", precision: "date" },
      value: String(value ?? ""),
      onChange: (next) => onChange(next ?? ""),
    };
  }

  if (field.type === "select" && field.options?.length) {
    return {
      key: field.key,
      label: field.label,
      required: field.required,
      spec: { valueType: "string", control: "choice", options: { source: "static", mode: field.options.length > 8 ? "autocomplete" : "dropdown", items: field.options, visibleCount: 5 } },
      value: String(value ?? ""),
      onChange: (next) => onChange(next ?? ""),
    };
  }

  return {
    key: field.key,
    label: field.label,
    required: field.required,
    spec: { valueType: field.type === "number" ? "number" : "string", control: field.type === "number" ? "number" : "text", multiline: field.type === "textarea" ? true : undefined },
    value: String(value ?? ""),
    onChange: (next) => onChange(String(next ?? "")),
    rows: field.type === "textarea" ? 3 : undefined,
  };
}
