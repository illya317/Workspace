"use client";

import { FormSurface } from "@workspace/core/ui";
import { HR_OFFICE_LOCATIONS, HR_RANKS } from "@workspace/hr/constants/field-options";
import RankPicker from "../../components/RankPicker";
import {
  DETAIL_FIELD_LABELS,
  DETAIL_FIELD_ORDER,
  EDUCATION_REQUIREMENT_OPTIONS,
  HIDDEN_POSITION_DETAIL_KEYS,
  POSITION_DESCRIPTION_BASE_DETAIL_KEYS,
  POSITION_DESCRIPTION_FLOW_DETAIL_KEYS,
  POSITION_DESCRIPTION_QUALIFICATION_DETAIL_KEYS,
  SALARY_TYPE_OPTIONS,
  WORK_SCHEDULE_OPTIONS,
  detailFieldRows,
  detailValueToText,
  isPrimitiveArray,
  normalizePositionDetails,
  parseDetailsObject,
  pickerOptions,
  textToDetailValue,
  type PositionDescriptionTemplate,
  type PositionDescriptionTemplateGroup,
} from "./description-details";
import { ExperienceRequirementsEditor, MajorRequirementsEditor, WorkEnvironmentEditor } from "./detail-editor-complex-fields";
import { EntityTagListEditor, SubordinateTagsEditor } from "./detail-editor-entity-tags";
import { EntityValueInput, StringListEditor } from "./detail-editor-primitives";
import { PositionChangeHistoryEditor, PositionDutyEditor } from "./position-description-repeatable-sections";
import type { Position } from "./types";

export function PositionDescriptionDetailsEditor({
  value,
  disabled,
  onChange,
  positionNames,
  currentPosition,
  positions,
  departmentNames,
  template,
}: {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  positionNames: Set<string>;
  currentPosition: Position;
  positions: Position[];
  departmentNames: Set<string>;
  template: PositionDescriptionTemplate;
}) {
  const details = parseDetailsObject(value);
  if (!details) {
    return (
      <FormSurface kind="fields" fields={[{
        key: "invalid-json",
        label: "明细 JSON 格式错误",
        error: "请检查 JSON 内容后重新保存。",
        fieldClassName: "md:col-span-2",
        spec: { valueType: "string", editor: "textarea", state: disabled ? "disabled" : "normal" },
        value,
        rows: 14,
        onChange: (next) => onChange(String(next ?? "")),
      }]} />
    );
  }

  const parsedDetails = normalizePositionDetails(details);
  const visibleGroups = new Set(template.groups);
  const visibleFields = template.fields ? new Set(template.fields) : null;
  const baseDetailKeys = POSITION_DESCRIPTION_BASE_DETAIL_KEYS;
  const qualificationDetailKeys = POSITION_DESCRIPTION_QUALIFICATION_DETAIL_KEYS;
  const flowDetailKeys = POSITION_DESCRIPTION_FLOW_DETAIL_KEYS;
  const groupedDetailKeys = new Set([...baseDetailKeys, ...qualificationDetailKeys, ...flowDetailKeys, ...HIDDEN_POSITION_DETAIL_KEYS, "duties", "managementDuties", "changeHistory", "attachments"]);
  const standardKeys = [
    ...DETAIL_FIELD_ORDER,
    ...Object.keys(parsedDetails).filter((key) => !DETAIL_FIELD_ORDER.includes(key)).sort((a, b) => a.localeCompare(b, "zh-CN")),
  ];
  const derivedSubordinates = positions
    .filter((position) => position.id !== currentPosition.id && position.reportTo?.trim() === currentPosition.name.trim())
    .map((position) => position.name)
    .filter((name, index, array) => name && array.indexOf(name) === index);

  function updateDetailValue(key: string, nextValue: unknown) {
    const next = { ...parsedDetails, [key]: nextValue };
    onChange(JSON.stringify(next, null, 2));
  }

  function updateDetailField(key: string, raw: string) {
    updateDetailValue(key, textToDetailValue(parsedDetails[key], raw));
  }

  function renderPrimitiveField(key: string) {
    if (HIDDEN_POSITION_DETAIL_KEYS.has(key)) return null;
    const fieldValue = parsedDetails[key];
    if (key === "subordinates") {
      return (
        <div key={key} className="md:col-span-2">
          <SubordinateTagsEditor
            label={DETAIL_FIELD_LABELS[key] || key}
            items={derivedSubordinates}
          />
        </div>
      );
    }
    if (key === "rank") {
      return (
        <div key={key}>
          <div className="mb-1 text-xs font-medium text-slate-500">{DETAIL_FIELD_LABELS[key] || key}</div>
          <RankPicker
            value={fieldValue}
            options={HR_RANKS}
            disabled={disabled}
            onChange={(next) => updateDetailValue(key, next || null)}
          />
        </div>
      );
    }
    if (key === "education") {
      return (
        <FormSurface key={key} kind="fields" fields={[{
          key,
          label: DETAIL_FIELD_LABELS[key] || key,
          spec: {
            valueType: "string",
            editor: "select",
            state: disabled ? "disabled" : "normal",
            options: { source: "static", items: pickerOptions(EDUCATION_REQUIREMENT_OPTIONS) },
          },
          value: String(fieldValue || "无要求"),
          placeholder: "无要求",
          onChange: (next) => updateDetailValue(key, next || "无要求"),
        }]} />
      );
    }
    if (key === "major") {
      return (
        <div key={key} className="md:col-span-2">
          <MajorRequirementsEditor
            label={DETAIL_FIELD_LABELS[key] || key}
            value={fieldValue}
            disabled={disabled}
            onChange={(items) => updateDetailValue(key, items)}
          />
        </div>
      );
    }
    if (key === "workEnvironments") {
      return (
        <div key={key} className="md:col-span-2">
          <WorkEnvironmentEditor
            label={DETAIL_FIELD_LABELS[key] || key}
            value={fieldValue}
            disabled={disabled}
            onChange={(items) => updateDetailValue(key, items)}
          />
        </div>
      );
    }
    if (key === "experienceRequirements") {
      return (
        <div key={key} className="md:col-span-2">
          <ExperienceRequirementsEditor
            label={DETAIL_FIELD_LABELS[key] || key}
            value={fieldValue}
            disabled={disabled}
            onChange={(items) => updateDetailValue(key, items)}
          />
        </div>
      );
    }
    if (key === "salaryType" || key === "officeLocation" || key === "workSchedule") {
      const options = key === "salaryType"
        ? SALARY_TYPE_OPTIONS
        : key === "officeLocation"
          ? HR_OFFICE_LOCATIONS
          : WORK_SCHEDULE_OPTIONS;
      return (
        <FormSurface key={key} kind="fields" fields={[{
          key,
          label: DETAIL_FIELD_LABELS[key] || key,
          spec: {
            valueType: "string",
            editor: "select",
            state: disabled ? "disabled" : "normal",
            options: { source: "static", items: pickerOptions(options) },
          },
          value: fieldValue,
          placeholder: "未设置",
          onChange: (next) => updateDetailValue(key, next || null),
        }]} />
      );
    }
    if (key === "distributionDeptNames") {
      return (
        <div key={key} className="md:col-span-2">
          <EntityTagListEditor
            label={DETAIL_FIELD_LABELS[key] || key}
            value={fieldValue}
            entity="department"
            disabled={disabled}
            validNames={departmentNames}
            onChange={(items) => updateDetailValue(key, items)}
          />
        </div>
      );
    }
    if (key === "trainingPositionNames") {
      return (
        <div key={key} className="md:col-span-2">
          <EntityTagListEditor
            label={DETAIL_FIELD_LABELS[key] || key}
            value={fieldValue}
            entity="position"
            disabled={disabled}
            validNames={positionNames}
            onChange={(items) => updateDetailValue(key, items)}
          />
        </div>
      );
    }
    if (key === "drafter" || key === "reviewer1") {
      return (
        <EntityValueInput
          key={key}
          label={DETAIL_FIELD_LABELS[key] || key}
          entity="department"
          value={fieldValue}
          disabled={disabled}
          invalid={String(fieldValue || "").includes("见首页")}
          onChange={(next) => updateDetailValue(key, next)}
        />
      );
    }
    if (key === "reviewer2" || key === "approver") {
      return (
        <EntityValueInput
          key={key}
          label={DETAIL_FIELD_LABELS[key] || key}
          entity="employee"
          value={fieldValue}
          disabled={disabled}
          invalid={String(fieldValue || "").includes("见首页")}
          onChange={(next) => updateDetailValue(key, next)}
        />
      );
    }
    if (isPrimitiveArray(fieldValue) || key === "training") {
      return (
        <div key={key} className="md:col-span-2">
          <StringListEditor
            label={DETAIL_FIELD_LABELS[key] || key}
            value={fieldValue}
            disabled={disabled}
            onChange={(items) => updateDetailValue(key, items)}
          />
        </div>
      );
    }
    const rows = detailFieldRows(fieldValue);
    return (
      <FormSurface
        key={key}
        kind="fields"
        fields={[{
          key,
          label: DETAIL_FIELD_LABELS[key] || key,
          fieldClassName: rows > 1 ? "md:col-span-2" : "",
          spec: { valueType: "string", editor: rows === 1 ? "input" : "textarea", state: disabled ? "disabled" : "normal" },
          value: detailValueToText(fieldValue),
          rows: rows === 1 ? undefined : rows,
          onChange: (next) => updateDetailField(key, String(next ?? "")),
        }]}
      />
    );
  }

  function renderGroup(title: string, keys: string[]) {
    const visibleKeys = visibleFields ? keys.filter((key) => visibleFields.has(key)) : keys;
    if (visibleKeys.length === 0) return null;
    return (
      <div className="space-y-3 md:col-span-2">
        <div className="border-b border-slate-200 pb-1 text-sm font-semibold text-slate-900">{title}</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {visibleKeys.map((key) => renderPrimitiveField(key))}
        </div>
      </div>
    );
  }

  const restKeys = standardKeys.filter((key) => !groupedDetailKeys.has(key) && !HIDDEN_POSITION_DETAIL_KEYS.has(key));
  const showGroup = (group: PositionDescriptionTemplateGroup) => visibleFields ? false : visibleGroups.has(group);
  const showField = (key: string, group: PositionDescriptionTemplateGroup) => visibleFields ? visibleFields.has(key) : visibleGroups.has(group);

  return (
    <>
      {(showGroup("base") || baseDetailKeys.some((key) => showField(key, "base"))) && renderGroup("说明书基础", baseDetailKeys)}
      {(showGroup("qualification") || qualificationDetailKeys.some((key) => showField(key, "qualification"))) && renderGroup("任职资格", qualificationDetailKeys)}
      {showField("duties", "duties") && (
        <PositionDutyEditor
          detailKey="duties"
          label="主要职责"
          records={Array.isArray(parsedDetails.duties) ? parsedDetails.duties as Array<Record<string, unknown>> : []}
          disabled={disabled}
          onChange={(records) => updateDetailValue("duties", records)}
        />
      )}
      {showField("managementDuties", "managementDuties") && (
        <PositionDutyEditor
          detailKey="managementDuties"
          label="管理职责"
          records={Array.isArray(parsedDetails.managementDuties) ? parsedDetails.managementDuties as Array<Record<string, unknown>> : []}
          disabled={disabled}
          onChange={(records) => updateDetailValue("managementDuties", records)}
        />
      )}
      {(showGroup("flow") || flowDetailKeys.some((key) => showField(key, "flow"))) && renderGroup("流转与审批", flowDetailKeys)}
      {showField("changeHistory", "history") && (
        <PositionChangeHistoryEditor
          records={Array.isArray(parsedDetails.changeHistory) ? parsedDetails.changeHistory as Array<Record<string, unknown>> : []}
          disabled={disabled}
          onChange={(records) => updateDetailValue("changeHistory", records)}
        />
      )}
      {!visibleFields && visibleGroups.has("rest") && restKeys.length > 0 && (
        <div className="space-y-3 md:col-span-2">
          <div className="border-b border-slate-200 pb-1 text-sm font-semibold text-slate-900">其他字段</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {restKeys.map((key) => renderPrimitiveField(key))}
          </div>
        </div>
      )}
    </>
  );
}
