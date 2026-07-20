"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createFormSection, createMessageSection, createPageBody, createPageDataSection, createSectionSection, type BodySurfaceProps, type BodySurfaceSectionSpec, type DataSurfaceCellSpec, type DataSurfaceStructuredCellSpec, type FormSurfaceFieldSpec, type SurfaceToolbarItems } from "@workspace/core/ui";
import { putJson, requestJson } from "@workspace/platform/ui/api-client";
import {
  OKR_CONTROL_SCOPE_OPTIONS,
  OKR_PERIOD_RULE_MODE_OPTIONS,
  OKR_PLAN_PERIOD_TYPE_OPTIONS,
} from "./model";
import {
  createDefaultOkrSettingsDraft as createDefaultDraft,
  draftWithOkrPeriodDate as draftWithPeriodDate,
  formatOkrControlRule as formatRule,
  findCycleForDate,
  hydrateOkrSettingsDraft as hydrateDraftFromActivePolicy,
  mergeSavedWorkOkrPolicy as mergeSavedPolicy,
  normalizeOkrDateValue as normalizeDateValue,
  normalizeOkrRuleMode as normalizeRuleMode,
  normalizeOkrRuleOffset as normalizeOffset,
  normalizeOkrScopeType as normalizeScopeType,
  normalizeOkrSettingsPeriodType,
  normalizedOkrScopeId as normalizedScopeId,
  okrRuleWithFixedAnchor as ruleWithFixedAnchor,
  todayOkrDate as todayDate,
  workOkrPolicyKey as policyKey,
  type OkrSettingsDraft,
} from "./work-okr-settings-draft";
import type { WorkOkrControlPolicy, WorkOkrControlResponse, WorkOkrControlRule, WorkOkrControlSettings, WorkOkrPeriodTypeRuleMode, WorkOkrWorkflowActionState } from "./types";

type PeriodRuleRow = {
  key: keyof WorkOkrControlSettings["periodTypes"];
  label: string;
};

const OKR_CONTROL_ENABLED_OPTIONS = [{ value: "enabled", label: "启用" }, { value: "disabled", label: "停用" }];
const OKR_EXCEPTION_ENABLED_OPTIONS = [{ value: "disabled", label: "不启用" }, { value: "enabled", label: "启用" }];
const PERIOD_RULE_ROWS: PeriodRuleRow[] = [
  { key: "yearly", label: "年" },
  { key: "half_year", label: "半年" },
  { key: "quarterly", label: "季度" },
  { key: "monthly", label: "月" },
  { key: "weekly", label: "周" },
];

export interface WorkOkrSettingsController {
  toolbarItems: SurfaceToolbarItems;
  sections: BodySurfaceSectionSpec[];
}

export function workOkrSettingsBody(sections: BodySurfaceSectionSpec[]): BodySurfaceProps {
  return createPageBody([
    createSectionSection("okr-settings", {
      title: "OKR 设置",
      sections,
    }),
  ]);
}

export function useWorkOkrSettingsController({
  enabled,
  onToast,
}: {
  enabled: boolean;
  onToast: (toast: { message: string; type: "success" | "error" }) => void;
}): WorkOkrSettingsController {
  const [settings, setSettings] = useState<WorkOkrControlResponse | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<WorkOkrControlSettings | null>(null);
  const [draft, setDraft] = useState<OkrSettingsDraft>(createDefaultDraft());
  const [hydratedPolicyKey, setHydratedPolicyKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const data = await requestJson<WorkOkrControlResponse>("/api/modules/work/tasks/okr-control", {
        fallbackMessage: "加载 OKR 设置失败",
      });
      setSettings(data);
      setSettingsDraft(data.settings);
      setDraft((current) => hydrateDraftFromActivePolicy(current, data.cycles, data.policies[0]));
    } catch (err) {
      onToast({ message: err instanceof Error ? err.message : "加载 OKR 设置失败", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [enabled, onToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedPolicyKey = useMemo(() => (
    draft.cycleId ? policyKey(draft.cycleId, draft.scopeType, draft.scopeId) : null
  ), [draft.cycleId, draft.scopeId, draft.scopeType]);

  const selectedPolicy = useMemo(() => {
    if (!settings || !draft.cycleId) return null;
    return settings.policies.find((policy) => (
      policyKey(policy.cycleId, policy.scopeType, policy.scopeId) === selectedPolicyKey
    )) ?? null;
  }, [draft.cycleId, selectedPolicyKey, settings]);

  useEffect(() => {
    if (!selectedPolicyKey || hydratedPolicyKey === selectedPolicyKey) return;
    setHydratedPolicyKey(selectedPolicyKey);
    if (!selectedPolicy) {
      setDraft((current) => ({
        ...current,
        isLocked: false,
        objectiveSubmitDeadline: null,
        krReviewOpensAt: null,
        krSubmitDeadline: null,
      }));
      return;
    }
    setDraft((current) => ({
      ...current,
      isLocked: selectedPolicy.isLocked,
      objectiveSubmitDeadline: selectedPolicy.objectiveSubmitDeadline,
      krReviewOpensAt: selectedPolicy.krReviewOpensAt,
      krSubmitDeadline: selectedPolicy.krSubmitDeadline,
    }));
  }, [hydratedPolicyKey, selectedPolicy, selectedPolicyKey]);

  const save = useCallback(async () => {
    if (!settingsDraft || saving) return;
    try {
      setSaving(true);
      const result = await putJson<{
        settings: WorkOkrControlSettings;
        settingsVersion: number;
        policy?: WorkOkrControlPolicy | null;
        deletedPolicyKey?: { cycleId: number; scopeType: string; scopeId: string } | null;
      }>("/api/modules/work/tasks/okr-control", {
        settings: settingsDraft,
        exception: {
          enabled: draft.exceptionEnabled,
          cycleId: draft.cycleId,
          scopeType: draft.scopeType,
          scopeId: normalizedScopeId(draft.scopeType, draft.scopeId),
          isLocked: draft.isLocked,
          objectiveSubmitDeadline: draft.objectiveSubmitDeadline || null,
          krReviewOpensAt: draft.krReviewOpensAt || null,
          krSubmitDeadline: draft.krSubmitDeadline || null,
        },
      }, "保存 OKR 设置失败");
      setSettingsDraft(result.settings);
      setSettings((current) => current ? {
        ...current,
        settings: result.settings,
        settingsVersion: result.settingsVersion,
        policies: mergeSavedPolicy(current.policies, result.policy ?? null, result.deletedPolicyKey ?? null),
      } : current);
      if (!result.policy) setHydratedPolicyKey(null);
      onToast({ message: "OKR 设置已保存", type: "success" });
    } catch (err) {
      onToast({ message: err instanceof Error ? err.message : "保存 OKR 设置失败", type: "error" });
    } finally {
      setSaving(false);
    }
  }, [draft, onToast, saving, settingsDraft]);

  const selectedCycle = findCycleForDate(settings?.cycles ?? [], draft.periodType, draft.periodDate);
  const disabled = loading || saving || !settings;
  const timeControlEnabled = settingsDraft?.enabled !== false;
  const defaultRuleFields = settingsDraft ? okrDefaultRuleFields(settingsDraft, setSettingsDraft, disabled) : [];
  const periodRows = settingsDraft ? okrPeriodRuleRows(settingsDraft, setSettingsDraft, disabled || !timeControlEnabled) : [];
  const exceptionDisabled = disabled || !timeControlEnabled || !draft.exceptionEnabled;
  const exceptionFields: FormSurfaceFieldSpec[] = [
    { key: "exceptionEnabled", label: "例外状态", required: true, spec: { valueType: "string", control: "choice", options: { source: "static", items: OKR_EXCEPTION_ENABLED_OPTIONS }, state: disabled ? "disabled" : "normal" }, value: draft.exceptionEnabled ? "enabled" : "disabled", placeholder: "请选择", onChange: (value) => setDraft((current) => ({ ...current, exceptionEnabled: value === "enabled" })) },
    { key: "periodType", label: "周期类型", required: draft.exceptionEnabled, spec: { valueType: "string", control: "choice", options: { source: "static", items: OKR_PLAN_PERIOD_TYPE_OPTIONS }, state: exceptionDisabled ? "disabled" : "normal" }, value: draft.periodType ?? "", placeholder: "请选择", onChange: (value) => setDraft((current) => draftWithPeriodDate(current, settings?.cycles ?? [], normalizeOkrSettingsPeriodType(value), current.periodDate ?? todayDate())) },
    { key: "periodDate", label: "具体周期", required: draft.exceptionEnabled, spec: { valueType: "date", control: "temporal", precision: "date", mask: selectedCycle ? { kind: "template", display: selectedCycle.name } : undefined, state: exceptionDisabled || !draft.periodType ? "disabled" : "normal" }, value: draft.periodDate, placeholder: "请选择", onChange: (value) => setDraft((current) => draftWithPeriodDate(current, settings?.cycles ?? [], current.periodType, normalizeDateValue(value))) },
    { key: "scopeType", label: "范围", spec: { valueType: "string", control: "choice", options: { source: "static", items: OKR_CONTROL_SCOPE_OPTIONS, visibleCount: 4 }, state: exceptionDisabled ? "disabled" : "normal" }, value: draft.scopeType, onChange: (value) => setDraft((current) => ({ ...current, scopeType: normalizeScopeType(value), scopeId: normalizeScopeType(value) === "global" ? "" : current.scopeId })) },
    { key: "scopeId", label: "范围 ID", spec: { valueType: "string", control: "text", state: exceptionDisabled || draft.scopeType === "global" ? "disabled" : "normal" }, value: draft.scopeId, placeholder: "请选择", onChange: (value) => setDraft((current) => ({ ...current, scopeId: String(value ?? "") })) },
    { key: "objectiveSubmitDeadline", label: "目标申报截止", spec: { valueType: "date", control: "temporal", precision: "date", state: exceptionDisabled ? "disabled" : "normal" }, value: draft.objectiveSubmitDeadline, placeholder: "请选择", onChange: (value) => setDraft((current) => ({ ...current, objectiveSubmitDeadline: String(value || "") || null })) },
    { key: "krReviewOpensAt", label: "结果申报开放", spec: { valueType: "date", control: "temporal", precision: "date", state: exceptionDisabled ? "disabled" : "normal" }, value: draft.krReviewOpensAt, placeholder: "请选择", onChange: (value) => setDraft((current) => ({ ...current, krReviewOpensAt: String(value || "") || null })) },
    { key: "krSubmitDeadline", label: "结果申报截止", spec: { valueType: "date", control: "temporal", precision: "date", state: exceptionDisabled ? "disabled" : "normal" }, value: draft.krSubmitDeadline, placeholder: "请选择", onChange: (value) => setDraft((current) => ({ ...current, krSubmitDeadline: String(value || "") || null })) },
  ];

  return {
    toolbarItems: [{
      kind: "action-group",
      key: "okr-settings-default-save",
      actions: [{
        key: "save-settings",
        kind: "save",
        label: saving ? "保存中..." : "保存设置",
        variant: "primary",
        disabled: loading || saving || !settingsDraft || (timeControlEnabled && draft.exceptionEnabled && (!draft.cycleId || (draft.scopeType !== "global" && !draft.scopeId.trim()))),
        onClick: save,
      }],
    }],
    sections: settings ? [
      createSectionSection("okr-default-rules-section", {
        title: "默认申报时间窗",
        sections: [
          ...(!timeControlEnabled ? [createMessageSection("okr-control-inactive", { content: "申报时间窗已停用：现有规则和例外继续保留，目标与结果仍可自由填写，提交不受时间限制。", tone: "muted" })] : []),
          createFormSection("okr-default-rules", { kind: "fields", content: { items: defaultRuleFields, layout: { columns: 3, density: "compact" } } }),
        ],
      }),
      createSectionSection("okr-workflows-section", {
        title: "目标与结果流程",
        sections: [
          createMessageSection("okr-workflow-boundary", { content: "时间窗只约束已启用流程的首次申报；流程关闭时，目标与结果按权限直接确认，不创建审批单。修订与更正不受首次申报时间窗限制。", tone: "muted" }),
          createPageDataSection("okr-workflows", { kind: "structured", rows: okrWorkflowRows(settings.workflowActions, timeControlEnabled), mobile: { presentation: "list" }, frame: "bordered", presentation: { density: "compact", header: "tinted" }, structuredScroll: true, scroll: { x: true } }),
        ],
      }),
      { ...createSectionSection("okr-period-rules-section", {
        title: "周期申报时间窗",
        sections: [createPageDataSection("okr-period-rules", { kind: "structured", rows: periodRows, frame: "bordered", presentation: { density: "compact", header: "tinted" }, structuredScroll: true, scroll: { x: true } })],
      }), visibility: "desktop" as const },
      createSectionSection("okr-control-exceptions-section", {
        title: "周期范围例外",
        sections: [createFormSection("okr-control-exceptions", { kind: "fields", content: { items: exceptionFields, layout: { columns: 3, density: "compact" } } })],
      }),
    ] : [
      createMessageSection("okr-control-loading", { content: loading ? "加载 OKR 设置中..." : "暂无 OKR 设置", tone: "muted" }),
    ],
  };
}

function okrWorkflowRows(actions: WorkOkrWorkflowActionState[], timeControlEnabled: boolean): DataSurfaceStructuredCellSpec[][] {
  const textCell = (value: string, emphasis?: "strong"): DataSurfaceStructuredCellSpec => ({
    content: { kind: "text", value, ...(emphasis ? { emphasis } : {}) },
  });
  const headers = ["适用对象", "业务动作", "流程状态", "关闭后行为", "申报时间窗"];
  return [
    headers.map((label) => ({
      content: { kind: "text", value: label },
      header: true,
      emphasis: "strong",
    })),
    ...actions.map((action) => [
      textCell(action.targetType === "personal" ? "个人" : "部门/项目", "strong"),
      textCell(action.label),
      textCell(action.enabled ? `已启用（v${action.policyVersion ?? action.actionContractVersion ?? 1}）` : "已关闭"),
      textCell(action.whenDisabled === "direct_write" ? "按权限直接确认" : "入口不显示"),
      textCell(action.kind === "objective_submit" || action.kind === "report_submit"
        ? action.enabled && timeControlEnabled ? "限制首次申报" : "不限"
        : "不适用"),
    ]),
  ];
}

function okrDefaultRuleFields(settings: WorkOkrControlSettings, setSettings: (next: WorkOkrControlSettings) => void, disabled: boolean): FormSurfaceFieldSpec[] {
  const patch = (next: Partial<WorkOkrControlSettings>) => setSettings({ ...settings, ...next });
  const enabledField: FormSurfaceFieldSpec = { key: "enabled", label: "申报时间窗", spec: { valueType: "string", control: "choice", options: { source: "static", items: OKR_CONTROL_ENABLED_OPTIONS }, state: disabled ? "disabled" : "normal" }, value: settings.enabled ? "enabled" : "disabled", onChange: (value) => patch({ enabled: value !== "disabled" }) };
  const rulesDisabled = disabled || !settings.enabled;
  return [
    enabledField,
    ruleOffsetField("objectiveOpensAtOffset", "目标申报开放", ruleWithFixedAnchor("objectiveOpensAt", settings.objectiveOpensAt), (rule) => patch({ objectiveOpensAt: rule }), rulesDisabled),
    ruleOffsetField("objectiveSubmitDeadlineOffset", "目标申报截止", ruleWithFixedAnchor("objectiveSubmitDeadline", settings.objectiveSubmitDeadline), (rule) => patch({ objectiveSubmitDeadline: rule }), rulesDisabled),
    ruleOffsetField("krReviewOpensAtOffset", "结果申报开放", ruleWithFixedAnchor("krReviewOpensAt", settings.krReviewOpensAt), (rule) => patch({ krReviewOpensAt: rule }), rulesDisabled),
    ruleOffsetField("krSubmitDeadlineOffset", "结果申报截止", ruleWithFixedAnchor("krSubmitDeadline", settings.krSubmitDeadline), (rule) => patch({ krSubmitDeadline: rule }), rulesDisabled),
  ];
}

function okrPeriodRuleRows(settings: WorkOkrControlSettings, setSettings: (next: WorkOkrControlSettings) => void, disabled: boolean): DataSurfaceStructuredCellSpec[][] {
  const updateMode = (key: PeriodRuleRow["key"], mode: WorkOkrPeriodTypeRuleMode) => setSettings({
    ...settings,
    periodTypes: { ...settings.periodTypes, [key]: { ...settings.periodTypes[key], mode } },
  });
  const updateRule = (key: PeriodRuleRow["key"], ruleKey: keyof Omit<WorkOkrControlSettings, "enabled" | "autoLock" | "periodTypes">, rule: WorkOkrControlRule) => setSettings({
    ...settings,
    periodTypes: { ...settings.periodTypes, [key]: { ...settings.periodTypes[key], mode: "custom", [ruleKey]: rule } },
  });
  return [
    ["周期类型", "规则", "目标申报开放", "目标申报截止", "结果申报开放", "结果申报截止"].map((label) => ({
      content: { kind: "text", value: label },
      header: true,
      emphasis: "strong",
    })),
    ...PERIOD_RULE_ROWS.map((row): DataSurfaceStructuredCellSpec[] => [
      { content: { kind: "text", value: row.label, emphasis: "strong" } },
      { content: { kind: "input", spec: { valueType: "string", control: "choice", options: { source: "static", items: OKR_PERIOD_RULE_MODE_OPTIONS }, state: disabled ? "disabled" : "normal" }, value: settings.periodTypes[row.key].mode, onChange: (value) => updateMode(row.key, normalizeRuleMode(value)) } },
      { content: periodRuleCell(settings, row, "objectiveOpensAt", updateRule, disabled) },
      { content: periodRuleCell(settings, row, "objectiveSubmitDeadline", updateRule, disabled) },
      { content: periodRuleCell(settings, row, "krReviewOpensAt", updateRule, disabled) },
      { content: periodRuleCell(settings, row, "krSubmitDeadline", updateRule, disabled) },
    ]),
  ];
}

function periodRuleCell(
  settings: WorkOkrControlSettings,
  row: PeriodRuleRow,
  key: keyof Omit<WorkOkrControlSettings, "enabled" | "autoLock" | "periodTypes">,
  updateRule: (period: PeriodRuleRow["key"], ruleKey: keyof Omit<WorkOkrControlSettings, "enabled" | "autoLock" | "periodTypes">, rule: WorkOkrControlRule) => void,
  disabled: boolean,
): DataSurfaceCellSpec {
  const periodRule = settings.periodTypes[row.key];
  if (periodRule.mode !== "custom") return { kind: "text", value: periodRule.mode === "report_only" ? "仅汇报" : periodRule.mode === "disabled" ? "不管控" : formatRule(settings[key]) };
  const rule = ruleWithFixedAnchor(key, periodRule[key] ?? settings[key]);
  return {
    kind: "group",
    direction: "row",
    items: [
      { kind: "input", spec: { valueType: "number", control: "number", state: disabled ? "disabled" : "normal" }, value: rule.offsetDays, onChange: (value) => updateRule(row.key, key, { ...rule, offsetDays: normalizeOffset(value) }) },
    ],
  };
}

function ruleOffsetField(key: string, label: string, rule: WorkOkrControlRule, onChange: (rule: WorkOkrControlRule) => void, disabled: boolean): FormSurfaceFieldSpec {
  return { key, label, spec: { valueType: "number", control: "number", state: disabled ? "disabled" : "normal" }, value: rule.offsetDays, onChange: (value) => onChange({ ...rule, offsetDays: normalizeOffset(value) }) };
}
