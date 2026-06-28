"use client";

import { type FormSurfaceItemSpec, type FormSurfaceLooseItem, type ReferenceOption, type useFeedback } from "@workspace/core/ui";
import { HR_MAJOR_OPTIONS, HR_OFFICE_LOCATIONS, HR_RANKS, normalizeHrMajorItems, type HRMajorItem } from "@workspace/hr/constants/field-options";
import { HR_REFERENCE_OPTIONS_ENDPOINT, fkKeyForEntity } from "../../fk-keys";
import { buildChangeHistoryField, buildDutyField, buildExperienceRequirementField, buildWorkEnvironmentFields } from "./position-description-repeatable-field-builders";
import {
  DETAIL_FIELD_LABELS,
  EDUCATION_REQUIREMENT_OPTIONS,
  HIDDEN_POSITION_DETAIL_KEYS,
  SALARY_TYPE_OPTIONS,
  WORK_SCHEDULE_OPTIONS,
  detailFieldRows,
  detailValueToText,
  isPrimitiveArray,
  pickerOptions,
  primitiveListItems,
  type PositionDescriptionTemplateGroup,
} from "./description-details";
import { selectedEntityName } from "./detail-editor-primitives";

export type DetailRecord = Record<string, unknown>;
type DetailFeedback = ReturnType<typeof useFeedback>;

function uniqueStrings(items: string[]) {
  return items.map((item) => item.trim()).filter(Boolean).filter((item, index, array) => array.indexOf(item) === index);
}

function rankGroups() {
  const grouped = new Map<string, string[]>();
  for (const option of HR_RANKS) {
    const match = option.match(/^([MPT])(\d+)$/);
    if (!match) continue;
    const list = grouped.get(match[1]) ?? [];
    list.push(match[2]);
    grouped.set(match[1], list);
  }
  return ["M", "P", "T"]
    .filter((key) => grouped.has(key))
    .map((key) => ({
      key,
      label: key,
      options: [...(grouped.get(key) ?? [])]
        .sort((a, b) => Number(a) - Number(b))
        .map((level) => ({ value: `${key}${level}`, label: `${key}${level}` })),
    }));
}


type PositionDescriptionDetailsFieldContext = {
  disabled?: boolean;
  parsedDetails: DetailRecord;
  visibleFields: Set<string> | null;
  visibleGroups: Set<PositionDescriptionTemplateGroup>;
  baseDetailKeys: string[];
  qualificationDetailKeys: string[];
  flowDetailKeys: string[];
  standardKeys: string[];
  groupedDetailKeys: Set<string>;
  derivedSubordinates: string[];
  positionNames: Set<string>;
  departmentNames: Set<string>;
  feedback: DetailFeedback;
  updateDetailValue: (key: string, nextValue: unknown) => void;
  updateDetailField: (key: string, raw: string) => void;
};

export function buildPositionDescriptionDetailFields({
  disabled,
  parsedDetails,
  visibleFields,
  visibleGroups,
  baseDetailKeys,
  qualificationDetailKeys,
  flowDetailKeys,
  standardKeys,
  groupedDetailKeys,
  derivedSubordinates,
  positionNames,
  departmentNames,
  feedback,
  updateDetailValue,
  updateDetailField,
}: PositionDescriptionDetailsFieldContext): FormSurfaceItemSpec<FormSurfaceLooseItem>[] {
  const fieldContext = { disabled, feedback, updateDetailValue };
  function entityName(entity: string, option?: ReferenceOption) {
    return selectedEntityName(entity, option) || null;
  }

  function tagListField({
    key,
    label,
    items,
    onItemsChange,
    placeholder,
    validNames,
    disabled: fieldDisabled = disabled,
  }: {
    key: string;
    label: string;
    items: string[];
    onItemsChange: (items: string[]) => void;
    placeholder?: string;
    validNames?: Set<string>;
    disabled?: boolean;
  }): FormSurfaceItemSpec<FormSurfaceLooseItem> {
    return {
      kind: "tagList",
      key,
      label,
      span: "wide",
      items,
      getKey: (item: string, index: number) => `${item}-${index}`,
      getLabel: (item: string) => item,
      onRemove: (_item: string, index: number) => onItemsChange(items.filter((_, itemIndex) => itemIndex !== index)),
      disabled: fieldDisabled,
      confirmMessage: (item: string) => `确定删除「${item || label}」吗？删除后需要保存才会生效。`,
      itemTitle: (item: string) => (validNames && !validNames.has(item) ? "当前主数据中未找到对应记录" : undefined),
      itemClassName: (item: string) =>
        validNames && !validNames.has(item)
          ? "border-red-300 bg-red-50 text-red-700"
          : "",
      emptyText: fieldDisabled ? "未设置" : undefined,
      shellClassName: "content-start",
      append: fieldDisabled ? undefined : {
        textInput: {
          key: `${key}-append`,
          placeholder: items.length === 0 ? placeholder || "新增条目" : "",
          onAppend: (values) => onItemsChange(uniqueStrings([...items, ...values])),
          onRemoveLast: () => {
            if (items.length > 0) onItemsChange(items.slice(0, -1));
          },
        },
      },
    };
  }

  function entityTagListField(key: string, label: string, value: unknown, entity: string, validNames?: Set<string>): FormSurfaceItemSpec<FormSurfaceLooseItem> {
    const items = primitiveListItems(value);
    return {
      kind: "tagList",
      key,
      label,
      span: "wide",
      items,
      getKey: (item: string, index: number) => `${item}-${index}`,
      getLabel: (item: string) => item,
      onRemove: (_item: string, index: number) => updateDetailValue(key, items.filter((_, itemIndex) => itemIndex !== index)),
      disabled,
      confirmMessage: (item: string) => `确定删除「${item || label}」吗？删除后需要保存才会生效。`,
      itemTitle: (item: string) => (validNames && !validNames.has(item) ? "当前主数据中未找到对应记录" : undefined),
      itemClassName: (item: string) =>
        validNames && !validNames.has(item)
          ? "border-red-300 bg-red-50 text-red-700"
          : "",
      emptyText: disabled ? "未设置" : undefined,
      shellClassName: "content-start",
      append: disabled ? undefined : {
        field: {
          key: `${key}-append`,
          label: "",
          spec: {
            valueType: "reference",
            control: "reference",
            state: disabled ? "disabled" : "normal",
            options: { source: "remote", fkKey: fkKeyForEntity(entity), endpoint: HR_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" },
          },
          value: "",
          displayValue: "",
          placeholder: items.length === 0 ? `搜索${label}` : `添加${label}`,
          onChange: (_label, option) => {
            const next = entityName(entity, option as ReferenceOption | undefined);
            if (next) updateDetailValue(key, uniqueStrings([...items, next]));
          },
        },
      },
    };
  }

  function entityValueField(key: string, label: string, entity: string, fieldValue: unknown): FormSurfaceItemSpec<FormSurfaceLooseItem> {
    const current = String(fieldValue || "");
    return {
      key,
      label,
      error: current.includes("见首页") ? "当前值不是有效引用，请重新选择。" : undefined,
      spec: {
        valueType: "reference",
        control: "reference",
        state: disabled ? "disabled" : "normal",
        options: { source: "remote", fkKey: fkKeyForEntity(entity), endpoint: HR_REFERENCE_OPTIONS_ENDPOINT, returnField: "name" },
      },
      value: current,
      displayValue: current,
      placeholder: `搜索${label}`,
      onChange: (_label, option) => updateDetailValue(key, entityName(entity, option as ReferenceOption | undefined)),
    };
  }

  function renderPrimitiveFields(key: string): FormSurfaceItemSpec<FormSurfaceLooseItem>[] {
    if (HIDDEN_POSITION_DETAIL_KEYS.has(key)) return [];
    const fieldValue = parsedDetails[key];
    if (key === "subordinates") {
      return [tagListField({ key, label: DETAIL_FIELD_LABELS[key] || key, items: derivedSubordinates, onItemsChange: () => undefined, disabled: true })];
    }
    if (key === "rank") {
      return [{
        key,
        label: DETAIL_FIELD_LABELS[key] || key,
        spec: {
          valueType: "string",
          control: "choice",
          state: disabled ? "disabled" : "normal",
          options: { source: "grouped", groups: rankGroups(), groupLabel: "职级序列", optionLabel: "等级", changeGroupLabel: "更换序列" },
        },
        value: fieldValue == null ? "" : String(fieldValue),
        placeholder: "未设置",
        onChange: (next) => updateDetailValue(key, next || null),
      }];
    }
    if (key === "education") {
      return [{
          key,
          label: DETAIL_FIELD_LABELS[key] || key,
          spec: {
            valueType: "string",
            control: "choice",
            state: disabled ? "disabled" : "normal",
            options: { source: "static", items: pickerOptions(EDUCATION_REQUIREMENT_OPTIONS) },
          },
          value: String(fieldValue || "无要求"),
          placeholder: "无要求",
          onChange: (next) => updateDetailValue(key, next || "无要求"),
        }];
    }
    if (key === "major") {
      const items = normalizeHrMajorItems(fieldValue);
      return [{
        kind: "tagList",
        key,
        label: DETAIL_FIELD_LABELS[key] || key,
        span: "wide",
        items,
        getKey: (item: HRMajorItem, index: number) => `${item.category}-${item.specialty}-${index}`,
        getLabel: (item: HRMajorItem) => item.specialty || item.category,
        onRemove: (_item: HRMajorItem, index: number) => updateDetailValue(key, items.filter((__, itemIndex) => itemIndex !== index)),
        disabled,
        confirmMessage: (item: HRMajorItem) => `确定删除专业要求「${item.category || ""}${item.specialty ? ` / ${item.specialty}` : ""}」吗？删除后需要保存才会生效。`,
        itemTitle: (item: HRMajorItem) => (item.category ? `${item.category} / ${item.specialty}` : item.specialty),
        emptyText: disabled ? "未设置" : undefined,
        shellClassName: "content-start",
        append: disabled ? undefined : {
          field: {
            key: "majorAppend",
            label: "",
            spec: {
              valueType: "string",
              control: "choice",
              state: disabled ? "disabled" : "normal",
              options: {
                source: "static",
                items: HR_MAJOR_OPTIONS.map((option) => ({ value: option.specialty, label: option.specialty, subtitle: option.category, searchText: option.category })),
                visibleCount: 5,
              },
            },
            value: "",
            placeholder: "未设置",
            onChange: (next) => {
              const selected = normalizeHrMajorItems(next)[0] ?? { category: "待选择", specialty: "" };
              if (selected.specialty) updateDetailValue(key, [...items.filter(item => item.specialty !== selected.specialty), selected]);
            },
          },
        },
      }];
    }
    if (key === "workEnvironments") {
      return buildWorkEnvironmentFields(fieldContext, key, DETAIL_FIELD_LABELS[key] || key, fieldValue);
    }
    if (key === "experienceRequirements") {
      return [buildExperienceRequirementField(fieldContext, key, DETAIL_FIELD_LABELS[key] || key, fieldValue)];
    }
    if (key === "salaryType" || key === "officeLocation" || key === "workSchedule") {
      const options = key === "salaryType"
        ? SALARY_TYPE_OPTIONS
        : key === "officeLocation"
          ? HR_OFFICE_LOCATIONS
          : WORK_SCHEDULE_OPTIONS;
      return [{
          key,
          label: DETAIL_FIELD_LABELS[key] || key,
          spec: {
            valueType: "string",
            control: "choice",
            state: disabled ? "disabled" : "normal",
            options: { source: "static", items: pickerOptions(options) },
          },
          value: fieldValue,
          placeholder: "未设置",
          onChange: (next) => updateDetailValue(key, next || null),
        }];
    }
    if (key === "distributionDeptNames") {
      return [entityTagListField(key, DETAIL_FIELD_LABELS[key] || key, fieldValue, "department", departmentNames)];
    }
    if (key === "trainingPositionNames") {
      return [entityTagListField(key, DETAIL_FIELD_LABELS[key] || key, fieldValue, "position", positionNames)];
    }
    if (key === "drafter" || key === "reviewer1") {
      return [entityValueField(key, DETAIL_FIELD_LABELS[key] || key, "department", fieldValue)];
    }
    if (key === "reviewer2" || key === "approver") {
      return [entityValueField(key, DETAIL_FIELD_LABELS[key] || key, "employee", fieldValue)];
    }
    if (isPrimitiveArray(fieldValue) || key === "training") {
      const items = primitiveListItems(fieldValue);
      return [tagListField({ key, label: DETAIL_FIELD_LABELS[key] || key, items, onItemsChange: (next) => updateDetailValue(key, next), placeholder: "新增条目" })];
    }
    const rows = detailFieldRows(fieldValue);
    return [{
          key,
          label: DETAIL_FIELD_LABELS[key] || key,
          span: rows > 1 ? "wide" : undefined,
          spec: { valueType: "string", control: "text", multiline: rows > 1 ? true : undefined, state: disabled ? "disabled" : "normal" },
          value: detailValueToText(fieldValue),
          rows: rows === 1 ? undefined : rows,
          onChange: (next) => updateDetailField(key, String(next ?? "")),
        }];
  }

  function groupField(title: string, keys: string[]): FormSurfaceItemSpec<FormSurfaceLooseItem> | null {
    const visibleKeys = visibleFields ? keys.filter((key) => visibleFields.has(key)) : keys;
    if (visibleKeys.length === 0) return null;
    return {
      kind: "section",
      key: title,
      title,
      columns: 2,
      fields: visibleKeys.flatMap((key) => renderPrimitiveFields(key)),
    };
  }

  const restKeys = standardKeys.filter((key) => !groupedDetailKeys.has(key) && !HIDDEN_POSITION_DETAIL_KEYS.has(key));
  const showGroup = (group: PositionDescriptionTemplateGroup) => visibleFields ? false : visibleGroups.has(group);
  const showField = (key: string, group: PositionDescriptionTemplateGroup) => visibleFields ? visibleFields.has(key) : visibleGroups.has(group);

  const fields: FormSurfaceItemSpec<FormSurfaceLooseItem>[] = [];
  const baseGroup = (showGroup("base") || baseDetailKeys.some((key) => showField(key, "base"))) ? groupField("说明书基础", baseDetailKeys) : null;
  const qualificationGroup = (showGroup("qualification") || qualificationDetailKeys.some((key) => showField(key, "qualification"))) ? groupField("任职资格", qualificationDetailKeys) : null;
  if (baseGroup) fields.push(baseGroup);
  if (qualificationGroup) fields.push(qualificationGroup);
  if (showField("duties", "duties")) {
    fields.push(buildDutyField(fieldContext, "duties", "主要职责", Array.isArray(parsedDetails.duties) ? parsedDetails.duties as DetailRecord[] : []));
  }
  if (showField("managementDuties", "managementDuties")) {
    fields.push(buildDutyField(fieldContext, "managementDuties", "管理职责", Array.isArray(parsedDetails.managementDuties) ? parsedDetails.managementDuties as DetailRecord[] : []));
  }
  const flowGroup = (showGroup("flow") || flowDetailKeys.some((key) => showField(key, "flow"))) ? groupField("流转与审批", flowDetailKeys) : null;
  if (flowGroup) fields.push(flowGroup);
  if (showField("changeHistory", "history")) {
    fields.push(buildChangeHistoryField(fieldContext, Array.isArray(parsedDetails.changeHistory) ? parsedDetails.changeHistory as DetailRecord[] : []));
  }
  const restGroup = !visibleFields && visibleGroups.has("rest") && restKeys.length > 0 ? groupField("其他字段", restKeys) : null;
  if (restGroup) fields.push(restGroup);

  return fields;
}
