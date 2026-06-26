"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState, useEffect } from "react";
import FKInput from "./FKInput";
import { InputControl } from "@workspace/core/ui";
import EthnicityPicker from "./EthnicityPicker";
import MajorPicker from "./MajorPicker";
import ProfessionalTitlePicker from "./ProfessionalTitlePicker";
import RankPicker from "./RankPicker";
import SchoolPicker from "./SchoolPicker";
import { AliasTagEditor } from "../profile/ProfileAliasTagsInput";
import type { FieldConfig, SelectOption } from "@workspace/hr/types";
import { formatPhoneNumber, normalizeChineseIdNumber, normalizePhoneValue } from "@workspace/hr/utils/identity";

interface GenericFieldInputProps {
  field: FieldConfig;
  value: unknown;
  onChange: (value: unknown) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  fkConfig?: { entity: string; fkKey?: string; displayField?: string };
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
      fetch(workspacePath("/api/modules/hr/roster/companies?active=1"))
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
          fkKey={fkConfig.fkKey}
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
        fkKey={fkConfig.fkKey}
        onChange={(opt) => onChange(opt?.name ?? "")}
      />
    );
  }

  if (field.type === "major") {
    return (
      <MajorPicker
        value={value}
        onChange={onChange}
        className={className}
      />
    );
  }

  if (field.type === "tags") {
    return (
      <AliasTagEditor
        value={value}
        onChange={onChange}
      />
    );
  }

  if (field.type === "school") {
    return (
      <SchoolPicker
        value={value}
        onChange={onChange}
        className={className}
      />
    );
  }

  if (field.type === "professionalTitle") {
    return (
      <ProfessionalTitlePicker
        value={value}
        onChange={onChange}
        className={className}
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
      <InputControl
        spec={{
          valueType: "string",
          editor: "select",
          options: {
            source: "static",
            items: [
              { label: "男", value: "男" },
              { label: "女", value: "女" },
            ],
          },
        }}
        value={selected}
        onChange={(next) => onChange(next)}
        className={className}
      />
    );
  }

  if (field.type === "select" && selectOptions.length > 0) {
    if (field.key === "ethnicity") {
      return (
        <EthnicityPicker
          value={value}
          onChange={onChange}
          className={className}
        />
      );
    }

    if (field.key === "rank") {
      return (
        <RankPicker
          value={value}
          options={selectOptions.map((option) => option.value)}
          onChange={onChange}
          className={className}
        />
      );
    }

    return (
      <InputControl
        spec={{
          valueType: "string",
          editor: selectOptions.length > 8 ? "autocomplete" : "select",
          options: { source: "static", items: selectOptions, visibleCount: 5 },
        }}
        value={String(value ?? "")}
        onChange={(next) => onChange(next ?? "")}
        className={className}
      />
    );
  }

  if (field.type === "boolean") {
    return (
      <InputControl
        spec={{ valueType: "boolean", editor: mode === "edit" ? "switch" : "checkbox" }}
        value={!!value}
        onChange={onChange}
      />
    );
  }

  if (field.type === "textarea") {
    return (
      <InputControl
        spec={{ valueType: "string", editor: "textarea" }}
        value={(value as string) ?? ""}
        onChange={onChange}
        className={className}
        rows={3}
      />
    );
  }

  const inputType = field.type === "number" ? "number" : "text";

  if (field.type === "date") {
    return (
      <InputControl
        spec={{ valueType: "date", editor: "datePicker" }}
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
        <InputControl
          inputRef={inputRef}
          spec={{ valueType: "string", editor: "input" }}
          type="tel"
          value={formatPhoneNumber(value)}
          onChange={(next) => onChange(normalizePhoneValue(String(next ?? "")))}
          onKeyDown={onKeyDown}
        />
      );
    }

    if (field.type === "chineseId") {
      return (
        <InputControl
          inputRef={inputRef}
          spec={{ valueType: "string", editor: "input" }}
          type="text"
          value={normalizeChineseIdNumber(value) ?? ""}
          onChange={(next) => onChange(normalizeChineseIdNumber(String(next ?? ""))?.slice(0, 18) ?? null)}
          onKeyDown={onKeyDown}
        />
      );
    }

    return (
      <InputControl
        inputRef={inputRef}
        spec={{ valueType: field.type === "number" ? "number" : "string", editor: field.type === "number" ? "number" : "input" }}
        type={inputType}
        value={String(value ?? "")}
        onChange={(next) => onChange(String(next ?? ""))}
        onKeyDown={onKeyDown}
      />
    );
  }

  return (
    <InputControl
      spec={{ valueType: field.type === "number" ? "number" : "string", editor: field.type === "number" ? "number" : "input" }}
      type={inputType}
      value={field.type === "phone" ? formatPhoneNumber(value) : field.type === "chineseId" ? normalizeChineseIdNumber(value) ?? "" : (value as string) ?? ""}
      onChange={(next) => {
        const text = String(next ?? "");
        if (field.type === "phone") onChange(normalizePhoneValue(text));
        else if (field.type === "chineseId") onChange(normalizeChineseIdNumber(text)?.slice(0, 18) ?? null);
        else onChange(text);
      }}
      className={className}
    />
  );
}
