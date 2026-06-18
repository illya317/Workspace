"use client";

import { useState, useEffect } from "react";
import FKInput from "./FKInput";
import { AutoSizeInput } from "./AutoSizeInput";
import CalendarDateInput from "./CalendarDateInput";
import EthnicityPicker from "./EthnicityPicker";
import MajorPicker from "./MajorPicker";
import OptionPicker from "./OptionPicker";
import ProfessionalTitlePicker from "./ProfessionalTitlePicker";
import RankPicker from "./RankPicker";
import SchoolPicker from "./SchoolPicker";
import type { FieldConfig, SelectOption } from "../types";
import { formatPhoneNumber, normalizeChineseIdNumber, normalizePhoneValue } from "@/lib/hr-identity";

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
      fetch("/workspace/api/hr/companies?active=1")
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

  if (field.type === "major") {
    return (
      <MajorPicker
        value={value}
        onChange={onChange}
        buttonClassName={`w-full rounded border border-emerald-400 bg-white px-2 py-1.5 text-left text-sm focus:outline-none ${className || ""}`}
      />
    );
  }

  if (field.type === "school") {
    return (
      <SchoolPicker
        value={value}
        onChange={onChange}
        buttonClassName={`w-full rounded border border-emerald-400 bg-white px-2 py-1.5 text-left text-sm focus:outline-none ${className || ""}`}
      />
    );
  }

  if (field.type === "professionalTitle") {
    return (
      <ProfessionalTitlePicker
        value={value}
        onChange={onChange}
        buttonClassName={`w-full rounded border border-emerald-400 bg-white px-2 py-1.5 text-left text-sm focus:outline-none ${className || ""}`}
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
      <OptionPicker
        value={selected}
        options={[
          { label: "男", value: "男" },
          { label: "女", value: "女" },
        ]}
        onChange={(next) => onChange(next)}
        buttonClassName={`rounded border border-emerald-400 px-2 py-1.5 text-left text-sm focus:outline-none ${className || ""}`}
      />
    );
  }

  if (field.type === "select" && selectOptions.length > 0) {
    if (field.key === "ethnicity") {
      return (
        <EthnicityPicker
          value={value}
          onChange={onChange}
          buttonClassName={`rounded border border-emerald-400 px-2 py-1.5 text-left text-sm focus:outline-none ${className || ""}`}
        />
      );
    }

    if (field.key === "rank") {
      return (
        <RankPicker
          value={value}
          options={selectOptions.map((option) => option.value)}
          onChange={onChange}
          buttonClassName={`rounded border border-emerald-400 px-2 py-1.5 text-left text-sm focus:outline-none ${className || ""}`}
        />
      );
    }

    return (
      <OptionPicker
        value={String(value ?? "")}
        options={selectOptions}
        onChange={(next) => onChange(next ?? "")}
        buttonClassName={`rounded border border-emerald-400 px-2 py-1.5 text-left text-sm focus:outline-none ${className || ""}`}
      />
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

  const inputType = field.type === "number" ? "number" : "text";

  if (field.type === "date") {
    return (
      <CalendarDateInput
        ref={inputRef}
        value={String(value ?? "")}
        onChange={(next) => onChange(next ?? "")}
        onKeyDown={onKeyDown}
        className={`rounded border border-emerald-400 px-2 py-1.5 text-sm focus:outline-none ${className || ""}`}
      />
    );
  }

  if (mode === "edit") {
    if (field.type === "phone") {
      return (
        <AutoSizeInput
          ref={inputRef}
          type="tel"
          value={formatPhoneNumber(value)}
          onChange={(e) => onChange(normalizePhoneValue(e.target.value))}
          onKeyDown={onKeyDown}
        />
      );
    }

    if (field.type === "chineseId") {
      return (
        <AutoSizeInput
          ref={inputRef}
          type="text"
          value={normalizeChineseIdNumber(value) ?? ""}
          onChange={(e) => onChange(normalizeChineseIdNumber(e.target.value)?.slice(0, 18) ?? null)}
          onKeyDown={onKeyDown}
        />
      );
    }

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
      value={field.type === "phone" ? formatPhoneNumber(value) : field.type === "chineseId" ? normalizeChineseIdNumber(value) ?? "" : (value as string) ?? ""}
      onChange={(e) => {
        if (field.type === "phone") onChange(normalizePhoneValue(e.target.value));
        else if (field.type === "chineseId") onChange(normalizeChineseIdNumber(e.target.value)?.slice(0, 18) ?? null);
        else onChange(e.target.value);
      }}
      className={className}
    />
  );
}
