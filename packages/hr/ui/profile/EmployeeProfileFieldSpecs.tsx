"use client";

import type { ProfileField } from "@workspace/hr/types";
import { createPanelSection, type FormSurfaceItemSpec, type BodySurfaceSectionSpec, type ReferenceOption } from "@workspace/core/ui";
import {
  HR_COMMON_ETHNICITIES,
  HR_ETHNICITIES,
  normalizeHrMajorItems,
} from "@workspace/hr/constants/field-options";
import { HR_REFERENCE_OPTIONS_ENDPOINT, fkKeyForEntity } from "../fk-keys";
import { solarToLunarBirthday } from "./lunar-birthday";
import { formatPhoneNumber, normalizeChineseIdNumber, normalizePhoneValue } from "@workspace/hr/utils/identity";
import { fromPercentDisplay, normalizeInputValue, toPercentDisplay } from "./profile-input-utils";
import { majorOptions, normalizeProfessionalTitle, normalizeRank, professionalTitleGroups, rankGroups, readAliasTags, schoolOptions, serializeAliasTags } from "./EmployeeProfileFieldOptions";

type EditableRecord = Record<string, unknown> & { id?: number; isNew?: boolean };

export function profileFieldSpec(
  field: ProfileField,
  record: EditableRecord,
  disabled: boolean,
  onChange: (key: string, value: unknown, option?: ReferenceOption) => void,
  isFieldDisabled?: (field: ProfileField, record: EditableRecord) => boolean,
): FormSurfaceItemSpec<string> {
  const disabledByStatus = record.isActive === true && (field.key === "leaveDate" || field.key === "leaveReason" || field.key === "leaveNote");
  const disabledByRule = isFieldDisabled?.(field, record) ?? false;
  const fieldDisabled = disabled || field.readOnly || disabledByStatus || disabledByRule;
  const base = {
    key: field.key,
    label: field.label,
    required: field.required,
    span: field.span === "wide" ? "wide" as const : undefined,
  };

  if (field.type === "lunarBirthday") {
    return { kind: "readonly", ...base, value: solarToLunarBirthday(record.birthDate) || "未设置" };
  }

  if (field.type === "tags") {
    const tags = readAliasTags(record[field.key]);
    return {
      kind: "tagList",
      ...base,
      items: tags,
      getKey: (tag, index) => `${tag}-${index}`,
      getLabel: (tag) => tag,
      onRemove: (_, index) => onChange(field.key, serializeAliasTags(tags.filter((__, tagIndex) => tagIndex !== index))),
      onUpdateLabel: (_, index, next) => onChange(field.key, serializeAliasTags(tags.map((tag, tagIndex) => tagIndex === index ? next : tag))),
      disabled: fieldDisabled,
      emptyText: fieldDisabled ? "未设置" : undefined,
      shellClassName: "content-start",

      append: fieldDisabled
        ? undefined
        : {
            textInput: {
              key: `${field.key}-append`,
              placeholder: tags.length === 0 ? "添加别名" : "",
              onAppend: (values) => onChange(field.key, serializeAliasTags([...tags, ...values])),
              onRemoveLast: () => {
                if (tags.length > 0) onChange(field.key, serializeAliasTags(tags.slice(0, -1)));
              },
            },
          },
    };
  }

  if (field.type === "major") {
    return {
      ...base,
      spec: {
        valueType: "string",
        control: "choice",
        options: { source: "static", items: majorOptions(), visibleCount: 5 },
        state: fieldDisabled ? "disabled" : "normal",
      },
      value: normalizeHrMajorItems(record[field.key])[0]?.specialty ?? "",
      placeholder: "未设置",
      onChange: (next) => onChange(field.key, next === null || next === undefined || next === "" ? null : String(next)),
    };
  }

  if (field.type === "school") {
    return {
      ...base,
      spec: {
        valueType: "string",
        control: "choice",
        options: { source: "static", items: schoolOptions(), visibleCount: 5 },
        state: fieldDisabled ? "disabled" : "normal",
      },
      value: record[field.key],
      placeholder: "未设置",
      onChange: (next) => onChange(field.key, next === null || next === undefined || next === "" ? null : String(next)),
    };
  }

  if (field.type === "professionalTitle") {
    return {
      ...base,
      spec: {
        valueType: "string",
        control: "choice",
        options: {
          source: "grouped",
          groups: professionalTitleGroups(),
          groupLabel: "职称系列",
          optionLabel: "职称级别",
          changeGroupLabel: "更换职称系列",
        },
        state: fieldDisabled ? "disabled" : "normal",
      },
      value: normalizeProfessionalTitle(record[field.key]),
      placeholder: "未设置",
      onChange: (next) => onChange(field.key, next === null || next === undefined || next === "" ? null : String(next)),
    };
  }

  if (field.type === "boolean") {
    const labels = field.booleanLabels ?? { true: "是", false: "否", unset: "未设置" };
    return {
      ...base,
      spec: {
        valueType: "boolean",
        control: "choice",
        state: fieldDisabled ? "disabled" : "normal",
        options: {
          source: "static",
          items: [
            { label: labels.true, value: "true" },
            { label: labels.false, value: "false" },
          ],
          unsetLabel: labels.unset ?? "未设置",
        },
      },
      value: record[field.key] === true ? "true" : record[field.key] === false ? "false" : null,
      placeholder: labels.unset ?? "未设置",
      onChange: (next) => onChange(field.key, next === null ? null : next === "true"),
    };
  }

  if (field.type === "fk" && field.entity) {
    const display = field.displayKey ? String(record[field.displayKey] || "") : field.valueFrom === "name" ? normalizeInputValue(record[field.key]) : undefined;
    const isEdpReportTo = field.fkKey === "hr.edp.reportTo";
    const rawReportToPositionId = isEdpReportTo ? record.positionId : null;
    const reportToPositionId =
      typeof rawReportToPositionId === "number" || typeof rawReportToPositionId === "string"
        ? rawReportToPositionId
        : null;
    const reportToDisabled = isEdpReportTo && !reportToPositionId;
    if (fieldDisabled) {
      return { kind: "readonly", ...base, value: display || normalizeInputValue(record[field.key]) || "未设置" };
    }
    return {
      ...base,
      spec: {
        valueType: "reference",
        control: "reference",
        state: reportToDisabled ? "disabled" : "normal",
        options: {
          source: "remote",
          fkKey: fkKeyForEntity(field.entity, field.fkKey),
          endpoint: HR_REFERENCE_OPTIONS_ENDPOINT,
          returnField: field.valueFrom === "name" ? "name" : field.valueFrom === "subtitle" ? "subtitle" : "id",
          lifecycleScope: field.activeOnly ? "active" : undefined,
          queryParams: isEdpReportTo ? { positionId: reportToPositionId } : undefined,
        },
      },
      value: record[field.key] == null ? "" : String(record[field.key]),
      displayValue: display,
      placeholder: reportToDisabled ? "先选择岗位" : `搜索${field.label}`,
      onChange: (next, option) => onChange(field.key, next ?? null, option as ReferenceOption | undefined),
    };
  }

  if (field.type === "textarea") {
    return {
      ...base,
      spec: { valueType: "string", control: "text", multiline: true, state: fieldDisabled ? "disabled" : "normal" },
      value: normalizeInputValue(record[field.key]),
      rows: 3,
      onChange: (next) => onChange(field.key, next || null),
    };
  }

  if (field.type === "select") {
    if (field.key === "rank") {
      return {
        ...base,
        spec: {
          valueType: "string",
          control: "choice",
          options: { source: "grouped", groups: rankGroups(field.options || []), groupLabel: "职级序列", optionLabel: "等级", changeGroupLabel: "更换序列" },
          state: fieldDisabled ? "disabled" : "normal",
        },
        value: normalizeRank(record[field.key]),
        placeholder: "未设置",
        onChange: (next) => onChange(field.key, next === null || next === undefined || next === "" ? null : String(next)),
      };
    }
    return {
      ...base,
      spec: {
        valueType: "string",
        control: "choice",
        state: fieldDisabled ? "disabled" : "normal",
        options: {
          source: "static",
          items: (field.key === "ethnicity" ? HR_ETHNICITIES : field.options || []).map((option) => ({ label: option, value: option })),
          commonValues: field.key === "ethnicity" ? HR_COMMON_ETHNICITIES : undefined,
          searchPlaceholder: field.key === "ethnicity" ? "搜索民族" : undefined,
        },
      },
      value: normalizeInputValue(record[field.key]),
      placeholder: "未设置",
      onChange: (next) => onChange(field.key, next),
    };
  }

  if (field.type === "date") {
    return {
      ...base,
      spec: { valueType: "date", control: "temporal", precision: "date", state: fieldDisabled ? "disabled" : "normal" },
      value: normalizeInputValue(record[field.key]),
      onChange: (next) => onChange(field.key, next),
    };
  }

  if (field.type === "phone") {
    return {
      ...base,
      spec: { valueType: "string", control: "text", state: fieldDisabled ? "disabled" : "normal" },
      value: formatPhoneNumber(record[field.key]),
      inputMode: "tel",
      onChange: (next) => onChange(field.key, normalizePhoneValue(next)),
    };
  }

  if (field.type === "percent") {
    return {
      ...base,
      spec: { valueType: "number", control: "number", format: "percent", state: fieldDisabled ? "disabled" : "normal", validation: { min: 0, max: 100 } },
      value: toPercentDisplay(record[field.key]),
      step: "0.01",
      onChange: (next) => onChange(field.key, fromPercentDisplay(next == null ? "" : String(next))),
    };
  }

  if (field.type === "chineseId") {
    return {
      ...base,
      spec: { valueType: "string", control: "text", state: fieldDisabled ? "disabled" : "normal" },
      value: normalizeChineseIdNumber(record[field.key]) ?? "",
      inputMode: "text",
      maxLength: 18,
      onChange: (next) => onChange(field.key, normalizeChineseIdNumber(next)?.slice(0, 18) ?? null),
    };
  }

  return {
    ...base,
    spec: {
      valueType: field.type === "number" ? "number" : "string",
      control: field.type === "number" ? "number" : "text",
      state: fieldDisabled ? "disabled" : "normal",
    },
    value: normalizeInputValue(record[field.key]),
    onChange: (raw) => onChange(field.key, field.type === "number" ? (raw ? Number(raw) : null) : raw || null),
  };
}

export function fieldGridItems(
  fields: ProfileField[],
  record: EditableRecord,
  disabled: boolean,
  onChange: (key: string, value: unknown, option?: ReferenceOption) => void,
  isFieldDisabled?: (field: ProfileField, record: EditableRecord) => boolean,
) {
  return fields.map((field) => profileFieldSpec(field, record, disabled, onChange, isFieldDisabled));
}

export function createFieldGridSection(
  fields: ProfileField[],
  record: EditableRecord,
  disabled: boolean,
  onChange: (key: string, value: unknown, option?: ReferenceOption) => void,
  isFieldDisabled?: (field: ProfileField, record: EditableRecord) => boolean,
  key = "fields",
): BodySurfaceSectionSpec {
  return {
    key,
    body: { kind: "form", form: {
      kind: "fields",
      content: {
        items: fieldGridItems(fields, record, disabled, onChange, isFieldDisabled),
        layout: { columns: 3 },
      },
    } },
  };
}

export function createEmptyFormSection(key: string, content: string): BodySurfaceSectionSpec {
  return {
    key,
    body: { kind: "form", form: {
      kind: "detail",
      content: { items: [{ kind: "note", key: "empty", content }] },
    } },
  };
}

export function createGroupedFieldSections(
  groups: Array<{ title: string; fields: ProfileField[] }>,
  record: EditableRecord,
  disabled: boolean,
  onChange: (key: string, value: unknown, option?: ReferenceOption) => void,
): BodySurfaceSectionSpec[] {
  return groups.map((group) => createPanelSection(group.title, {
    title: group.title,

    sections: [createFieldGridSection(group.fields, record, disabled, onChange, undefined, `${group.title}-fields`)],
  }));
}
