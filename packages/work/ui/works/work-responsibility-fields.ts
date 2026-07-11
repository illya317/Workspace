"use client";

import { useEffect } from "react";
import type { FormSurfaceFieldSpec } from "@workspace/core/ui";
import { WORK_REFERENCE_OPTIONS_ENDPOINT } from "./api";
import type { WorkTarget } from "./types";
import { useResponsibilityChoices, useResponsibilityPositionChoices } from "./useResponsibilityChoices";

export type WorkResponsibilityDraftFields = {
  ownerEmployeeId: number | null;
  ownerEmployeeName: string;
  collaborationId?: number | null;
  responsibilityNodeId: number | null;
  responsibilityLabel: string;
  responsibilityPositionId: number | null;
  responsibilityPositionName: string;
};

export function useWorkResponsibilityFields<TDraft extends WorkResponsibilityDraftFields>({
  draft,
  disabled,
  target,
  responsibilityFkKey,
  responsibilityRequired,
  onPatch,
  ownerKey = "owner",
  ownerLabel = "负责人",
  ownerPlaceholder = "搜索员工",
  responsibilityKey = "responsibility",
  responsibilityLabel = "关联职责",
  responsibilitySpan,
  responsibilityGroupLabel = "职责大类",
  responsibilityOptionLabel = "职责小项",
  responsibilityPlaceholder,
  responsibilityEmptyText,
  responsibilityDisabledPlaceholder = "先选择执行责任人",
  responsibilityChoiceMode = "grouped",
  ownerRequired = true,
  enabled = true,
}: {
  draft: TDraft;
  disabled: boolean;
  target?: WorkTarget | null;
  responsibilityFkKey: string;
  responsibilityRequired: boolean;
  onPatch: (next: Partial<TDraft>) => void;
  ownerKey?: string;
  ownerLabel?: string;
  ownerPlaceholder?: string;
  responsibilityKey?: string;
  responsibilityLabel?: string;
  responsibilitySpan?: FormSurfaceFieldSpec["span"];
  responsibilityGroupLabel?: string;
  responsibilityOptionLabel?: string;
  responsibilityPlaceholder?: string;
  responsibilityEmptyText?: string;
  responsibilityDisabledPlaceholder?: string;
  responsibilityChoiceMode?: "grouped" | "flat";
  ownerRequired?: boolean;
  enabled?: boolean;
}) {
  const canChooseResponsibility = enabled && (Boolean(draft.ownerEmployeeId) || target?.targetType === "personal");
  const responsibilityChoices = useResponsibilityChoices({
    enabled: canChooseResponsibility,
    fkKey: responsibilityFkKey,
    target,
    ownerEmployeeId: draft.ownerEmployeeId,
    positionId: draft.responsibilityPositionId,
  });
  const positionChoices = useResponsibilityPositionChoices({
    enabled,
    target,
    ownerEmployeeId: draft.ownerEmployeeId,
  });

  useEffect(() => {
    if (!enabled || draft.responsibilityPositionId) return;
    const defaultPosition = positionChoices.options.find((option) => option.isPrimary) ?? positionChoices.options[0] ?? null;
    if (!defaultPosition) return;
    onPatch({
      responsibilityPositionId: defaultPosition.id,
      responsibilityPositionName: defaultPosition.name,
    } as Partial<TDraft>);
  }, [draft.responsibilityPositionId, enabled, onPatch, positionChoices.options]);

  useEffect(() => {
    if (!enabled || !draft.responsibilityPositionId || draft.responsibilityPositionName) return;
    const position = positionChoices.byId.get(String(draft.responsibilityPositionId));
    if (!position) return;
    onPatch({
      responsibilityPositionName: position.name,
    } as Partial<TDraft>);
  }, [draft.responsibilityPositionId, draft.responsibilityPositionName, enabled, onPatch, positionChoices.byId]);

  const selectedPositionName = draft.responsibilityPositionId
    ? positionChoices.byId.get(String(draft.responsibilityPositionId))?.name ?? draft.responsibilityPositionName
    : "";

  const ownerField: FormSurfaceFieldSpec = {
    key: ownerKey,
    label: ownerLabel,
    required: ownerRequired,
    spec: {
      valueType: "reference",
      control: "reference",
      options: {
        source: "remote",
        fkKey: "work.tasks.owner.employee",
        endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT,
        returnField: "id",
        queryParams: workTargetQueryParams(target, draft.collaborationId),
      },
      state: disabled ? "disabled" : "normal",
    },
    value: draft.ownerEmployeeId ? String(draft.ownerEmployeeId) : "",
    displayValue: draft.ownerEmployeeName,
    placeholder: ownerPlaceholder,
    onChange: (value: unknown, option: unknown) => onPatch({
      ownerEmployeeId: typeof option === "object" && option && "id" in option ? Number(option.id) : (value ? draft.ownerEmployeeId : null),
      ownerEmployeeName: typeof option === "object" && option && "name" in option ? String(option.name) : (value ? String(value) : ""),
      responsibilityPositionId: null,
      responsibilityPositionName: "",
      responsibilityNodeId: null,
      responsibilityLabel: "",
    } as Partial<TDraft>),
  };

  const positionField: FormSurfaceFieldSpec = {
    key: "responsibilityPosition",
    label: "关联岗位",
    required: responsibilityRequired,
    spec: {
      valueType: "string",
      control: "choice",
      options: { source: "static", items: positionChoices.items, visibleCount: 6 },
      state: disabled || !enabled || (!draft.ownerEmployeeId && target?.targetType !== "personal") ? "disabled" : "normal",
    },
    value: draft.responsibilityPositionId ? String(draft.responsibilityPositionId) : "",
    displayValue: selectedPositionName,
    placeholder: draft.ownerEmployeeId || target?.targetType === "personal" ? "选择关联岗位" : "先选择负责人",
    loading: positionChoices.loading,
    emptyText: draft.ownerEmployeeId || target?.targetType === "personal" ? "暂无可选岗位" : "请先选择负责人",
    onChange: (value: unknown) => {
      const id = String(value ?? "");
      const position = id ? positionChoices.byId.get(id) ?? null : null;
      onPatch({
        responsibilityPositionId: position ? position.id : null,
        responsibilityPositionName: position ? position.name : "",
        responsibilityNodeId: null,
        responsibilityLabel: "",
      } as Partial<TDraft>);
    },
  };

  const responsibilityField: FormSurfaceFieldSpec = {
    key: responsibilityKey,
    label: responsibilityLabel,
    required: responsibilityRequired,
    span: responsibilitySpan,
    spec: {
      valueType: "string",
      control: "choice",
      options: responsibilityChoiceMode === "flat"
        ? { source: "static", items: responsibilityChoices.items, visibleCount: 8 }
        : {
          source: "grouped",
          groups: responsibilityChoices.groups,
          groupLabel: responsibilityGroupLabel,
          optionLabel: responsibilityOptionLabel,
          visibleCount: 8,
        },
      state: disabled || !canChooseResponsibility || !draft.responsibilityPositionId ? "disabled" : "normal",
    },
    value: draft.responsibilityNodeId ? String(draft.responsibilityNodeId) : "",
    placeholder: canChooseResponsibility
      ? draft.responsibilityPositionId ? (responsibilityPlaceholder ?? "选择关联职责") : "先选择关联岗位"
      : responsibilityDisabledPlaceholder,
    loading: responsibilityChoices.loading,
    emptyText: canChooseResponsibility
      ? draft.responsibilityPositionId ? (responsibilityEmptyText ?? "暂无可选职责") : "请先选择关联岗位"
      : "请先选择执行责任人",
    onChange: (value: unknown) => {
      const id = String(value ?? "");
      const responsibility = id ? responsibilityChoices.byId.get(id) ?? null : null;
      onPatch({
        responsibilityNodeId: responsibility ? responsibility.id : null,
        responsibilityLabel: responsibility ? responsibility.name : "",
        ...(!draft.ownerEmployeeId && responsibility ? {
          ownerEmployeeId: responsibility.lockedEmployeeId,
          ownerEmployeeName: responsibility.lockedEmployeeName,
        } : {}),
      } as Partial<TDraft>);
    },
  };

  return { ownerField, positionField, responsibilityField };
}

export function workTargetQueryParams(target: WorkTarget | null | undefined, collaborationId?: number | null) {
  return {
    targetType: target?.targetType,
    targetId: target?.targetId,
    collaborationId: collaborationId ?? undefined,
  };
}
