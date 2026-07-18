"use client";

import type { ReactNode } from "react";
import {
  createPageBody,
  InputSurface,
  BodySurface,
  createSectionSection,
  type BodySurfaceCommandSpec,
  type InputSurfaceProps,
  type BodySurfaceSectionSpec,
} from "@workspace/core/ui";
import type { ReferenceOption } from "@workspace/core/ui";
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
  onChange: (key: string, value: unknown, option?: ReferenceOption) => void;
}

function ControlField(control: InputSurfaceProps) {
  return <InputSurface {...control} />;
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
      <ControlField
        spec={{ valueType: "string", control: "text", state: "readonly" }}
        value={solarToLunarBirthday(value) || ""}
        placeholder="未设置"
      />
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
      <ControlField
        spec={{
          valueType: "boolean",
          control: "choice",
          state: disabled ? "disabled" : "normal",
          options: {
            source: "static",
            items: [
              { label: labels.true, value: "true" },
              { label: labels.false, value: "false" },
            ],
            unsetLabel: labels.unset ?? "未设置",
          },
        }}
        value={value === true ? "true" : value === false ? "false" : null}
        placeholder={labels.unset ?? "未设置"}
        onChange={(next) => {
          onChange(field.key, next === null ? null : next === "true");
        }}
      />
    );
  }

  if (field.type === "fk" && field.entity) {
    const display = displayValue || (field.valueFrom === "name" ? normalizeInputValue(value) : undefined);
    const isEdpPosition = field.fkKey === "hr.edp.position";
    const isEdpReportTo = field.fkKey === "hr.edp.reportTo";
    const rawDepartmentId = isEdpPosition || isEdpReportTo ? record?.departmentId : null;
    const departmentId =
      typeof rawDepartmentId === "number" || typeof rawDepartmentId === "string"
        ? rawDepartmentId
        : null;
    const rawReportingCompanyId = isEdpPosition || isEdpReportTo ? record?.reportingCompanyId : null;
    const reportingCompanyId =
      typeof rawReportingCompanyId === "number" || typeof rawReportingCompanyId === "string"
        ? rawReportingCompanyId
        : null;
    const rawReportToPositionId = isEdpReportTo ? record?.positionId : null;
    const reportToPositionId =
      typeof rawReportToPositionId === "number" || typeof rawReportToPositionId === "string"
        ? rawReportToPositionId
        : null;
    const rawPositionReportOverrideId = isEdpReportTo ? record?.positionReportOverrideId : null;
    const positionReportOverrideId =
      typeof rawPositionReportOverrideId === "number" || typeof rawPositionReportOverrideId === "string"
        ? rawPositionReportOverrideId
        : null;
    const positionDisabled = isEdpPosition && (!reportingCompanyId || !departmentId);
    const reportToDisabled = isEdpReportTo && !reportToPositionId;
    if (disabled) {
      return (
        <ControlField
          spec={{ valueType: "string", control: "text", state: "readonly" }}
          value={display || normalizeInputValue(value) || ""}
          placeholder="未设置"
        />
      );
    }
    return (
      <ControlField
        spec={{
          valueType: "reference",
          control: "choice",
          state: disabled || positionDisabled || reportToDisabled ? "disabled" : "normal",
          options: {
            source: "remote",
            fkKey: fkKeyForEntity(field.entity, field.fkKey),
            endpoint: HR_REFERENCE_OPTIONS_ENDPOINT,
            returnField:
              field.valueFrom === "name" ? "name" : field.valueFrom === "subtitle" ? "subtitle" : "id",
            lifecycleScope: field.activeOnly ? "active" : undefined,
            queryParams: isEdpPosition
              ? { reportingCompanyId, departmentId }
              : isEdpReportTo
                ? { positionId: reportToPositionId, reportingCompanyId, departmentId, positionReportOverrideId }
                : undefined,
          },
        }}
        value={value == null ? "" : String(value)}
        displayValue={display}
        placeholder={positionDisabled ? (!reportingCompanyId ? "先选择汇报公司" : "先选择部门") : reportToDisabled ? "先选择岗位" : `搜索${field.label}`}
        onChange={(next, option) => {
          onChange(field.key, next ?? null, option as ReferenceOption | undefined);
        }}
      />
    );
  }

  if (field.type === "textarea") {
    return (
      <ControlField
        spec={{ valueType: "string", control: "text", multiline: true, state: disabled ? "disabled" : "normal" }}
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

    const currentValue = normalizeInputValue(value);
    const options = field.options || [];
    const visibleOptions = currentValue && !options.includes(currentValue)
      ? [currentValue, ...options]
      : options;
    return (
      <ControlField
        spec={{
          valueType: "string",
          control: "choice",
          state: disabled ? "disabled" : "normal",
          options: { source: "static", items: visibleOptions.map((option) => ({ label: option, value: option })) },
        }}
        value={currentValue}
        onChange={(next) => onChange(field.key, next)}
      />
    );
  }

  if (field.type === "date") {
    return (
      <ControlField
        spec={{ valueType: "date", control: "temporal", precision: "date", state: disabled ? "disabled" : "normal" }}
        value={normalizeInputValue(value)}
        onChange={(next) => onChange(field.key, next)}
      />
    );
  }

  if (field.type === "phone") {
    return (
      <ControlField
        spec={{ valueType: "string", control: "text", state: disabled ? "disabled" : "normal" }}
        value={formatPhoneNumber(value)}
        onChange={(next) => onChange(field.key, normalizePhoneValue(next))}
        inputMode="tel"
      />
    );
  }

  if (field.type === "percent") {
    return (
      <ControlField
        spec={{
          valueType: "number",
          control: "number",
          format: "percent",
          state: disabled ? "disabled" : "normal",
          validation: { min: 0, max: 100 },
        }}
        value={toPercentDisplay(value)}
        onChange={(next) => onChange(field.key, fromPercentDisplay(next == null ? "" : String(next)))}
        step="0.01"
      />
    );
  }

  if (field.type === "chineseId") {
    return (
      <ControlField
        spec={{ valueType: "string", control: "text", state: disabled ? "disabled" : "normal" }}
        value={normalizeChineseIdNumber(value) ?? ""}
        onChange={(next) => onChange(field.key, normalizeChineseIdNumber(next)?.slice(0, 18) ?? null)}
        inputMode="text"
        maxLength={18}
      />
    );
  }

  return (
    <ControlField
      spec={{
        valueType: field.type === "number" ? "number" : "string",
        control: field.type === "number" ? "number" : "text",
        state: disabled ? "disabled" : "normal",
      }}
      value={normalizeInputValue(value)}
      onChange={(raw) => {
        onChange(field.key, field.type === "number" ? (raw ? Number(raw) : null) : raw || null);
      }}
    />
  );
}

export function SectionShell({
  title,
  status,
  actions,
  sections,
}: {
  title: ReactNode;
  status?: ReactNode;
  actions?: BodySurfaceCommandSpec[];
  className?: string;
  sections: BodySurfaceSectionSpec[];
}) {
  return (
    <BodySurface {...createPageBody([createSectionShellSection({ title, status, actions, sections })])} />
  );
}

export function createSectionShellSection({
  title,
  status,
  actions,
  sections,
  key = "section",
}: {
  title: ReactNode;
  status?: ReactNode;
  actions?: BodySurfaceCommandSpec[];
  className?: string;
  sections: BodySurfaceSectionSpec[];
  key?: string;
}): BodySurfaceSectionSpec {
  const headerTitle = title && status ? [title, " · ", status] : title || status || null;

  return createSectionSection(key, {
    title: headerTitle ?? "",
    actions,
    chrome: "plain",
    mobilePresentation: "drilldown",
    sections,

  });
}
