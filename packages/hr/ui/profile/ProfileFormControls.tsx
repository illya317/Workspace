"use client";

import type { ReactNode } from "react";
import {
  CalendarDateInput,
  FieldInputShell,
  FkFieldInput,
  OptionPicker,
  ReadOnlyField,
  SectionCard,
  TextField,
  TextareaField,
} from "@workspace/core/ui";
import type { FkFieldOption } from "@workspace/core/ui";
import EthnicityPicker from "../components/EthnicityPicker";
import MajorPicker from "../components/MajorPicker";
import ProfessionalTitlePicker from "../components/ProfessionalTitlePicker";
import RankPicker from "../components/RankPicker";
import SchoolPicker from "../components/SchoolPicker";
import type { ProfileField } from "@workspace/hr/types";
import { HR_REFERENCE_OPTIONS_ENDPOINT, fkKeyForEntity } from "../fk-keys";
import { solarToLunarBirthday } from "./lunar-birthday";
import { formatPhoneNumber, normalizeChineseIdNumber, normalizePhoneValue } from "@workspace/hr/utils/identity";
import { AliasTagsInput } from "./ProfileAliasTagsInput";
import { fromPercentDisplay, normalizeInputValue, toPercentDisplay } from "./profile-input-utils";

interface FieldInputProps {
  field: ProfileField;
  value: unknown;
  record?: Record<string, unknown>;
  displayValue?: string | null;
  disabled?: boolean;
  onChange: (key: string, value: unknown, option?: FkFieldOption) => void;
}

export function ProfileFieldInput({
  field,
  value,
  record,
  displayValue,
  disabled,
  onChange,
}: FieldInputProps) {
  if (field.type === "lunarBirthday") {
    return (
      <ReadOnlyField value={solarToLunarBirthday(value) || <span className="text-slate-400">未设置</span>} />
    );
  }

  if (field.type === "tags") {
    return (
      <AliasTagsInput
        field={field}
        value={value}
        disabled={disabled}
        onChange={onChange}
      />
    );
  }

  if (field.type === "major") {
    return (
      <MajorPicker
        value={value}
        disabled={disabled}
        onChange={(next) => onChange(field.key, next)}
      />
    );
  }

  if (field.type === "school") {
    return (
      <SchoolPicker
        value={value}
        disabled={disabled}
        onChange={(next) => onChange(field.key, next)}
      />
    );
  }

  if (field.type === "professionalTitle") {
    return (
      <ProfessionalTitlePicker
        value={value}
        disabled={disabled}
        onChange={(next) => onChange(field.key, next)}
      />
    );
  }

  if (field.type === "boolean") {
    const labels = field.booleanLabels ?? { true: "是", false: "否", unset: "未设置" };
    return (
      <OptionPicker
        disabled={disabled}
        value={value === true ? "true" : value === false ? "false" : null}
        options={[
          { label: labels.true, value: "true" },
          { label: labels.false, value: "false" },
        ]}
        placeholder={labels.unset ?? "未设置"}
        onChange={(next) => {
          onChange(field.key, next === null ? null : next === "true");
        }}
      />
    );
  }

  if (field.type === "fk" && field.entity) {
    const display = displayValue || (field.valueFrom === "name" ? normalizeInputValue(value) : undefined);
    const isEdpReportTo = field.fkKey === "hr.edp.reportTo";
    const rawReportToPositionId = isEdpReportTo ? record?.positionId : null;
    const reportToPositionId =
      typeof rawReportToPositionId === "number" || typeof rawReportToPositionId === "string"
        ? rawReportToPositionId
        : null;
    const reportToDisabled = isEdpReportTo && !reportToPositionId;
    if (disabled) {
      return (
        <ReadOnlyField value={display || normalizeInputValue(value) || <span className="text-slate-400">未设置</span>} />
      );
    }
    return (
      <FkFieldInput
        fkKey={fkKeyForEntity(field.entity, field.fkKey)}
        endpoint={HR_REFERENCE_OPTIONS_ENDPOINT}
        value={value == null ? "" : String(value)}
        displayValue={display}
        disabled={disabled || reportToDisabled}
        lifecycleScope={field.activeOnly ? "active" : undefined}
        queryParams={isEdpReportTo ? { positionId: reportToPositionId } : undefined}
        placeholder={reportToDisabled ? "先选择岗位" : `搜索${field.label}`}
        className="w-full"
        onChange={(_label, option) => {
          const next =
            field.valueFrom === "name"
              ? option?.name
              : field.valueFrom === "subtitle"
                ? option?.subtitle
                : option?.id;
          onChange(field.key, next ?? null, option);
        }}
      />
    );
  }

  if (field.type === "textarea") {
    return (
      <TextareaField
        disabled={disabled}
        value={normalizeInputValue(value)}
        onChange={(next) => onChange(field.key, next || null)}
        rows={3}
      />
    );
  }

  if (field.type === "select") {
    if (field.key === "ethnicity") {
      return (
        <EthnicityPicker
          disabled={disabled}
          value={value}
          onChange={(next) => onChange(field.key, next)}
        />
      );
    }

    if (field.key === "rank") {
      return (
        <RankPicker
          disabled={disabled}
          value={value}
          options={field.options || []}
          onChange={(next) => onChange(field.key, next)}
        />
      );
    }

    return (
      <OptionPicker
        disabled={disabled}
        value={normalizeInputValue(value)}
        options={(field.options || []).map((option) => ({ label: option, value: option }))}
        onChange={(next) => onChange(field.key, next)}
      />
    );
  }

  if (field.type === "date") {
    return (
      <CalendarDateInput
        disabled={disabled}
        value={normalizeInputValue(value)}
        onChange={(next) => onChange(field.key, next)}
      />
    );
  }

  if (field.type === "phone") {
    return (
      <TextField
        disabled={disabled}
        type="tel"
        value={formatPhoneNumber(value)}
        onChange={(next) => onChange(field.key, normalizePhoneValue(next))}
        inputMode="tel"
      />
    );
  }

  if (field.type === "percent") {
    return (
      <FieldInputShell className="focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500">
        <TextField
          disabled={disabled}
          type="number"
          min={0}
          max={100}
          step="0.01"
          value={toPercentDisplay(value)}
          onChange={(next) => onChange(field.key, fromPercentDisplay(next))}
          unstyled
          className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 outline-none disabled:bg-slate-100 disabled:text-slate-500"
        />
        <span className="grid w-10 place-items-center border-l border-slate-200 bg-slate-50 text-slate-500">%</span>
      </FieldInputShell>
    );
  }

  if (field.type === "chineseId") {
    return (
      <TextField
        disabled={disabled}
        type="text"
        value={normalizeChineseIdNumber(value) ?? ""}
        onChange={(next) => onChange(field.key, normalizeChineseIdNumber(next)?.slice(0, 18) ?? null)}
        inputMode="text"
        maxLength={18}
      />
    );
  }

  return (
    <TextField
      disabled={disabled}
      type={field.type === "number" ? "number" : "text"}
      value={normalizeInputValue(value)}
      onChange={(raw) => {
        onChange(field.key, field.type === "number" ? (raw ? Number(raw) : null) : raw || null);
      }}
    />
  );
}

export function SectionShell({
  title,
  subtitle,
  status,
  actions,
  className,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const headerTitle = title ? (
    <div>
      <div>{title}</div>
      {status && <div className="mt-2">{status}</div>}
    </div>
  ) : status ? <div>{status}</div> : null;

  return (
    <SectionCard
      title={headerTitle}
      subtitle={subtitle}
      actions={actions && <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">{actions}</div>}
      className={className}
      bodyClassName="p-3"
    >
      {children}
    </SectionCard>
  );
}
