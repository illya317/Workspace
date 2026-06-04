"use client";

import { useState, useEffect } from "react";
import FKInput from "./FKInput";
import { AutoSizeInput } from "./AutoSizeInput";
import type { FieldConfig, SelectOption } from "../types";

interface GenericFieldInputProps {
  field: FieldConfig;
  value: unknown;
  onChange: (value: unknown) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  fkConfig?: { entity: string; displayField?: string };
  mode: "edit" | "create";
  className?: string;
}

export default function GenericFieldInput({
  field,
  value,
  onChange,
  onKeyDown,
  inputRef,
  fkConfig,
  mode,
  className,
}: GenericFieldInputProps) {
  // 动态加载 select 选项
  const [dynamicOptions, setDynamicOptions] = useState<SelectOption[]>([]);
  useEffect(() => {
    if (field.optionsSource === "companies") {
      fetch("/api/hr/companies?active=1")
        .then((r) => r.json())
        .then((data) => {
          const companies = (data.companies || []) as Array<{ code: string; name: string }>;
          const opts: SelectOption[] = [
            { label: "自身", value: "" },
            ...companies.map((c) => ({ label: `${c.code} ${c.name}`, value: c.code })),
          ];
          setDynamicOptions(opts);
        })
        .catch(() => {});
    }
  }, [field.optionsSource]);

  const selectOptions = field.options?.length ? field.options : dynamicOptions;

  if (field.type === "fk" && fkConfig) {
    if (mode === "create") {
      return (
        <FKInput
          value={(value as { id?: number } | undefined)?.id ?? null}
          displayValue={(value as { name?: string } | undefined)?.name ?? ""}
          entity={fkConfig.entity}
          onChange={(opt) => onChange(opt)}
        />
      );
    }
    // edit mode: inline editing only needs the display name
    return (
      <FKInput
        value={null}
        displayValue={String(value ?? "")}
        entity={fkConfig.entity}
        onChange={(opt) => onChange(opt?.name ?? "")}
      />
    );
  }

  if (field.key === "gender") {
    const selected =
      value === true || value === "男"
        ? "男"
        : value === false || value === "女"
          ? "女"
          : "男";
    return (
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className={`rounded border border-emerald-400 px-2 py-1.5 text-sm focus:outline-none ${className || ""}`}
      >
        <option value="男">男</option>
        <option value="女">女</option>
      </select>
    );
  }

  if (field.type === "select" && selectOptions.length > 0) {
    return (
      <select
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className={`rounded border border-emerald-400 px-2 py-1.5 text-sm focus:outline-none ${className || ""}`}
      >
        {selectOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "boolean") {
    if (mode === "edit") {
      return (
        <button
          type="button"
          onClick={() => onChange(!value)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 ${value ? "bg-emerald-500" : "bg-gray-300"}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? "translate-x-6" : "translate-x-1"}`}
          />
        </button>
      );
    }
    return (
      <input
        type="checkbox"
        checked={!!value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300"
      />
    );
  }

  if (field.type === "textarea") {
    return (
      <textarea
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none ${className || ""}`}
        rows={3}
      />
    );
  }

  const inputType =
    field.type === "number" ? "number" : field.type === "date" ? "date" : "text";

  if (mode === "edit") {
    return (
      <AutoSizeInput
        ref={inputRef}
        type={inputType}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
    );
  }

  return (
    <AutoSizeInput
      type={inputType}
      value={(value as string) ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    />
  );
}
