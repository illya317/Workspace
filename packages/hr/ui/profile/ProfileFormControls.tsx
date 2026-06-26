"use client";

import type { ReactNode } from "react";
import {
  FormSurface,
  PageSurface,
  type FormSurfaceInputControlSpec,
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

function ControlField(control: Omit<FormSurfaceInputControlSpec, "kind">) {
  return <FormSurface kind="control" control={{ kind: "inputControl", ...control }} />;
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
        spec={{ valueType: "string", editor: "input", state: "readonly" }}
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
          editor: "select",
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
    const isEdpReportTo = field.fkKey === "hr.edp.reportTo";
    const rawReportToPositionId = isEdpReportTo ? record?.positionId : null;
    const reportToPositionId =
      typeof rawReportToPositionId === "number" || typeof rawReportToPositionId === "string"
        ? rawReportToPositionId
        : null;
    const reportToDisabled = isEdpReportTo && !reportToPositionId;
    if (disabled) {
      return (
        <ControlField
          spec={{ valueType: "string", editor: "input", state: "readonly" }}
          value={display || normalizeInputValue(value) || ""}
          placeholder="未设置"
        />
      );
    }
    return (
      <ControlField
        spec={{
          valueType: "reference",
          editor: "autocomplete",
          state: disabled || reportToDisabled ? "disabled" : "normal",
          options: {
            source: "remote",
            fkKey: fkKeyForEntity(field.entity, field.fkKey),
            endpoint: HR_REFERENCE_OPTIONS_ENDPOINT,
            returnField:
              field.valueFrom === "name" ? "name" : field.valueFrom === "subtitle" ? "subtitle" : "id",
            lifecycleScope: field.activeOnly ? "active" : undefined,
            queryParams: isEdpReportTo ? { positionId: reportToPositionId } : undefined,
          },
        }}
        value={value == null ? "" : String(value)}
        displayValue={display}
        placeholder={reportToDisabled ? "先选择岗位" : `搜索${field.label}`}
        onChange={(next, option) => {
          onChange(field.key, next ?? null, option as FkFieldOption | undefined);
        }}
      />
    );
  }

  if (field.type === "textarea") {
    return (
      <ControlField
        spec={{ valueType: "string", editor: "textarea", state: disabled ? "disabled" : "normal" }}
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
      <ControlField
        spec={{
          valueType: "string",
          editor: "select",
          state: disabled ? "disabled" : "normal",
          options: { source: "static", items: (field.options || []).map((option) => ({ label: option, value: option })) },
        }}
        value={normalizeInputValue(value)}
        onChange={(next) => onChange(field.key, next)}
      />
    );
  }

  if (field.type === "date") {
    return (
      <ControlField
        spec={{ valueType: "date", editor: "datePicker", state: disabled ? "disabled" : "normal" }}
        value={normalizeInputValue(value)}
        onChange={(next) => onChange(field.key, next)}
      />
    );
  }

  if (field.type === "phone") {
    return (
      <ControlField
        spec={{ valueType: "string", editor: "input", state: disabled ? "disabled" : "normal" }}
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
          editor: "number",
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
        spec={{ valueType: "string", editor: "input", state: disabled ? "disabled" : "normal" }}
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
        editor: field.type === "number" ? "number" : "input",
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
    <PageSurface
      embedded
      kind="detail"
      className={className}
      blocks={[
        {
          kind: "section",
          key: "section",
          title: headerTitle,
          subtitle,
          blocks: [
            ...(actions
              ? [{
                  kind: "moduleView" as const,
                  key: "actions",
                  view: <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">{actions}</div>,
                }]
              : []),
            { kind: "moduleView", key: "content", view: children },
          ],
          bodyClassName: "p-3",
        },
      ]}
    />
  );
}
