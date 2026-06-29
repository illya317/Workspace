"use client";

import { createFormSection, createPageBody, PageSurface, type FormSurfaceProps, useFeedback } from "@workspace/core/ui";
import {
  DETAIL_FIELD_ORDER,
  HIDDEN_POSITION_DETAIL_KEYS,
  POSITION_DESCRIPTION_BASE_DETAIL_KEYS,
  POSITION_DESCRIPTION_FLOW_DETAIL_KEYS,
  POSITION_DESCRIPTION_QUALIFICATION_DETAIL_KEYS,
  normalizePositionDetails,
  parseDetailsObject,
  textToDetailValue,
  type PositionDescriptionTemplate,
} from "./description-details";
import { buildPositionDescriptionDetailFields } from "./position-description-details-fields";
import type { Position } from "./types";

type PositionDescriptionDetailsSurfaceProps = {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  positionNames: Set<string>;
  currentPosition: Position;
  positions: Position[];
  departmentNames: Set<string>;
  template: PositionDescriptionTemplate;
};

export function usePositionDescriptionDetailsSurface({
  value,
  disabled,
  onChange,
  positionNames,
  currentPosition,
  positions,
  departmentNames,
  template,
}: PositionDescriptionDetailsSurfaceProps): FormSurfaceProps {
  const feedback = useFeedback();
  const details = parseDetailsObject(value);
  if (!details) {
    return {
      kind: "fields",
      content: { items: [{
        key: "invalid-json",
        label: "明细 JSON 格式错误",
        error: "请检查 JSON 内容后重新保存。",
        span: "wide",
        spec: { valueType: "string" as const, control: "text" as const, multiline: true, state: disabled ? "disabled" as const : "normal" as const },
        value,
        rows: 14,
        onChange: (next: unknown) => onChange(String(next ?? "")),
      }] },
    };
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

  const fields = buildPositionDescriptionDetailFields({
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
  });

  return {
    kind: "fields",
    content: { items: fields, layout: { columns: 2 } },
  };
}

export function PositionDescriptionDetailsEditor(props: PositionDescriptionDetailsSurfaceProps) {
  const surface = usePositionDescriptionDetailsSurface(props);
  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([createFormSection("position-description-details", surface)])}
    />
  );
}
