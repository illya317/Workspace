"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createFormSection, createMessageSection, createPageBody, createPageDataSection, createSectionSection, type BodySurfaceProps, type BodySurfaceSectionSpec, type DataSurfaceCellSpec, type DataSurfaceStructuredCellSpec, type FormSurfaceFieldSpec, type SurfaceToolbarItems } from "@workspace/core/ui";
import { putJson, requestJson } from "@workspace/platform/ui/api-client";
import { OKR_PLAN_PERIOD_TYPE_OPTIONS } from "./model";
import type { WorkOkrControlCycleOption, WorkOkrControlPolicy, WorkOkrControlResponse, WorkOkrControlRule, WorkOkrControlSettings, WorkOkrPeriodType, WorkOkrPeriodTypeRuleMode } from "./types";

type OkrSettingsDraft = {
  exceptionEnabled: boolean;
  periodType: WorkOkrPeriodType | null;
  periodDate: string | null;
  cycleId: number | null;
  scopeType: WorkOkrControlPolicy["scopeType"];
  scopeId: string;
  isLocked: boolean;
  objectiveSubmitDeadline: string | null;
  krReviewOpensAt: string | null;
  krSubmitDeadline: string | null;
};

type PeriodRuleRow = {
  key: keyof WorkOkrControlSettings["periodTypes"];
  label: string;
};

const SCOPE_OPTIONS = [
  { value: "global", label: "全局" },
  { value: "company", label: "公司" },
  { value: "committee", label: "运营委员会" },
  { value: "department", label: "部门" },
];
const AUTO_LOCK_OPTIONS = [
  { value: "off", label: "不自动锁定" },
  { value: "afterObjectiveDeadline", label: "O 截止后" },
  { value: "afterKrDeadline", label: "KR 截止后" },
];
const OKR_CONTROL_ENABLED_OPTIONS = [{ value: "enabled", label: "启用" }, { value: "disabled", label: "停用" }];
const OKR_EXCEPTION_ENABLED_OPTIONS = [{ value: "disabled", label: "不启用" }, { value: "enabled", label: "启用" }];
const OKR_LOCK_OPTIONS = [{ value: "unlocked", label: "未锁定" }, { value: "locked", label: "已锁定" }];
const PERIOD_RULE_MODE_OPTIONS = [
  { value: "inherit", label: "继承默认" },
  { value: "custom", label: "自定义" },
  { value: "disabled", label: "不管控" },
  { value: "report_only", label: "仅汇报" },
];
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
        fallbackMessage: "加载 OKR 管控设置失败",
      });
      setSettings(data);
      setSettingsDraft(data.settings);
      setDraft((current) => hydrateDraftFromActivePolicy(current, data.cycles, data.policies[0]));
    } catch (err) {
      onToast({ message: err instanceof Error ? err.message : "加载 OKR 管控设置失败", type: "error" });
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
      const result = await putJson<{ settings: WorkOkrControlSettings; policy?: WorkOkrControlPolicy | null }>("/api/modules/work/tasks/okr-control", {
        settings: settingsDraft,
        exception: {
          enabled: settingsDraft.enabled && draft.exceptionEnabled,
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
      setSettings((current) => current ? { ...current, settings: result.settings, policies: result.policy ? [result.policy] : [] } : current);
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
  const periodRows = settingsDraft ? okrPeriodRuleRows(settingsDraft, setSettingsDraft, disabled) : [];
  const exceptionDisabled = disabled || !timeControlEnabled || !draft.exceptionEnabled;
  const exceptionFields: FormSurfaceFieldSpec[] = [
    { key: "exceptionEnabled", label: "例外状态", required: true, spec: { valueType: "string", control: "choice", options: { source: "static", items: OKR_EXCEPTION_ENABLED_OPTIONS }, state: disabled ? "disabled" : "normal" }, value: draft.exceptionEnabled ? "enabled" : "disabled", placeholder: "请选择", onChange: (value) => setDraft((current) => ({ ...current, exceptionEnabled: value === "enabled" })) },
    { key: "periodType", label: "周期类型", required: draft.exceptionEnabled, spec: { valueType: "string", control: "choice", options: { source: "static", items: OKR_PLAN_PERIOD_TYPE_OPTIONS }, state: exceptionDisabled ? "disabled" : "normal" }, value: draft.periodType ?? "", placeholder: "请选择", onChange: (value) => setDraft((current) => draftWithPeriodDate(current, settings?.cycles ?? [], normalizeOkrSettingsPeriodType(value), current.periodDate ?? todayDate())) },
    { key: "periodDate", label: "具体周期", required: draft.exceptionEnabled, spec: { valueType: "date", control: "temporal", precision: "date", mask: selectedCycle ? { kind: "template", display: selectedCycle.name } : undefined, state: exceptionDisabled || !draft.periodType ? "disabled" : "normal" }, value: draft.periodDate, placeholder: "请选择", onChange: (value) => setDraft((current) => draftWithPeriodDate(current, settings?.cycles ?? [], current.periodType, normalizeDateValue(value))) },
    { key: "scopeType", label: "范围", spec: { valueType: "string", control: "choice", options: { source: "static", items: SCOPE_OPTIONS, visibleCount: 4 }, state: exceptionDisabled ? "disabled" : "normal" }, value: draft.scopeType, onChange: (value) => setDraft((current) => ({ ...current, scopeType: normalizeScopeType(value), scopeId: normalizeScopeType(value) === "global" ? "" : current.scopeId })) },
    { key: "scopeId", label: "范围 ID", spec: { valueType: "string", control: "text", state: exceptionDisabled || draft.scopeType === "global" ? "disabled" : "normal" }, value: draft.scopeId, placeholder: "请选择", onChange: (value) => setDraft((current) => ({ ...current, scopeId: String(value ?? "") })) },
    { key: "isLocked", label: "锁定", spec: { valueType: "string", control: "choice", options: { source: "static", items: OKR_LOCK_OPTIONS }, state: exceptionDisabled ? "disabled" : "normal" }, value: draft.isLocked ? "locked" : "unlocked", onChange: (value) => setDraft((current) => ({ ...current, isLocked: value === "locked" })) },
    { key: "objectiveSubmitDeadline", label: "目标截止", spec: { valueType: "date", control: "temporal", precision: "date", state: exceptionDisabled ? "disabled" : "normal" }, value: draft.objectiveSubmitDeadline, placeholder: "请选择", onChange: (value) => setDraft((current) => ({ ...current, objectiveSubmitDeadline: String(value || "") || null })) },
    { key: "krReviewOpensAt", label: "KR开放时间", spec: { valueType: "date", control: "temporal", precision: "date", state: exceptionDisabled ? "disabled" : "normal" }, value: draft.krReviewOpensAt, placeholder: "请选择", onChange: (value) => setDraft((current) => ({ ...current, krReviewOpensAt: String(value || "") || null })) },
    { key: "krSubmitDeadline", label: "KR 截止", spec: { valueType: "date", control: "temporal", precision: "date", state: exceptionDisabled ? "disabled" : "normal" }, value: draft.krSubmitDeadline, placeholder: "请选择", onChange: (value) => setDraft((current) => ({ ...current, krSubmitDeadline: String(value || "") || null })) },
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
        title: "默认规则",
        sections: [createFormSection("okr-default-rules", { kind: "fields", content: { items: defaultRuleFields, layout: { columns: 3, density: "compact" } } })],
      }),
      createSectionSection("okr-workflows-section", {
        title: "审批流程",
        sections: [createPageDataSection("okr-workflows", { kind: "structured", rows: okrWorkflowRows(), frame: "bordered", presentation: { density: "compact", header: "tinted" }, structuredScroll: true, scroll: { x: true } })],
      }),
      ...(timeControlEnabled ? [createSectionSection("okr-period-rules-section", {
        title: "周期类型规则",
        sections: [createPageDataSection("okr-period-rules", { kind: "structured", rows: periodRows, frame: "bordered", presentation: { density: "compact", header: "tinted" }, structuredScroll: true, scroll: { x: true } })],
      }),
      createSectionSection("okr-control-exceptions-section", {
        title: "具体例外",
        sections: [createFormSection("okr-control-exceptions", { kind: "fields", content: { items: exceptionFields, layout: { columns: 3, density: "compact" } } })],
      })] : []),
    ] : [
      createMessageSection("okr-control-loading", { content: loading ? "加载 OKR 管控设置中..." : "暂无 OKR 管控设置", tone: "muted" }),
    ],
  };
}

function okrWorkflowRows(): DataSurfaceStructuredCellSpec[][] {
  const textCell = (value: string, emphasis?: "strong"): DataSurfaceStructuredCellSpec => ({
    content: { kind: "text", value, ...(emphasis ? { emphasis } : {}) },
  });
  const headers = ["场景", "部门目标", "个人目标", "配置入口"];
  const rows = [
    ["期初目标提交", "部门期初目标提交", "个人期初目标提交", "流程设置 / 工作计划"],
    ["期初目标修订", "部门期初目标修订", "个人期初目标修订", "流程设置 / 工作计划"],
    ["考核结果提交", "部门考核结果提交", "个人考核结果提交", "流程设置 / 目标考核"],
    ["考核结果修订", "部门考核结果修订", "个人考核结果修订", "流程设置 / 目标考核"],
  ];
  return [
    headers.map((label) => ({
      content: { kind: "text", value: label },
      header: true,
      emphasis: "strong",
    })),
    ...rows.map(([scene, department, personal, entry]) => [
      textCell(scene, "strong"),
      textCell(department),
      textCell(personal),
      textCell(entry),
    ]),
  ];
}

function okrDefaultRuleFields(settings: WorkOkrControlSettings, setSettings: (next: WorkOkrControlSettings) => void, disabled: boolean): FormSurfaceFieldSpec[] {
  const patch = (next: Partial<WorkOkrControlSettings>) => setSettings({ ...settings, ...next });
  const enabledField: FormSurfaceFieldSpec = { key: "enabled", label: "时间管控", spec: { valueType: "string", control: "choice", options: { source: "static", items: OKR_CONTROL_ENABLED_OPTIONS }, state: disabled ? "disabled" : "normal" }, value: settings.enabled ? "enabled" : "disabled", onChange: (value) => patch({ enabled: value !== "disabled" }) };
  if (!settings.enabled) return [enabledField];
  return [
    enabledField,
    ruleOffsetField("objectiveOpensAtOffset", "OKR开放时间", ruleWithFixedAnchor("objectiveOpensAt", settings.objectiveOpensAt), (rule) => patch({ objectiveOpensAt: rule }), disabled),
    ruleOffsetField("objectiveSubmitDeadlineOffset", "O 截止偏移", ruleWithFixedAnchor("objectiveSubmitDeadline", settings.objectiveSubmitDeadline), (rule) => patch({ objectiveSubmitDeadline: rule }), disabled),
    ruleOffsetField("krReviewOpensAtOffset", "KR开放时间", ruleWithFixedAnchor("krReviewOpensAt", settings.krReviewOpensAt), (rule) => patch({ krReviewOpensAt: rule }), disabled),
    ruleOffsetField("krSubmitDeadlineOffset", "KR 截止偏移", ruleWithFixedAnchor("krSubmitDeadline", settings.krSubmitDeadline), (rule) => patch({ krSubmitDeadline: rule }), disabled),
    { key: "autoLock", label: "自动锁定", spec: { valueType: "string", control: "choice", options: { source: "static", items: AUTO_LOCK_OPTIONS }, state: disabled ? "disabled" : "normal" }, value: settings.autoLock, onChange: (value) => patch({ autoLock: normalizeAutoLock(value) }) },
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
    ["周期类型", "规则", "OKR开放时间", "O 截止偏移", "KR开放时间", "KR 截止偏移"].map((label) => ({
      content: { kind: "text", value: label },
      header: true,
      emphasis: "strong",
    })),
    ...PERIOD_RULE_ROWS.map((row): DataSurfaceStructuredCellSpec[] => [
      { content: { kind: "text", value: row.label, emphasis: "strong" } },
      { content: { kind: "input", spec: { valueType: "string", control: "choice", options: { source: "static", items: PERIOD_RULE_MODE_OPTIONS }, state: disabled ? "disabled" : "normal" }, value: settings.periodTypes[row.key].mode, onChange: (value) => updateMode(row.key, normalizeRuleMode(value)) } },
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

function formatRule(rule: WorkOkrControlRule) {
  const anchor = rule.anchor === "periodStart" ? "周期开始" : "周期结束";
  if (rule.offsetDays === 0) return anchor;
  return `${anchor}${rule.offsetDays > 0 ? "后" : "前"} ${Math.abs(rule.offsetDays)} 天`;
}

function ruleWithFixedAnchor(key: keyof Omit<WorkOkrControlSettings, "enabled" | "autoLock" | "periodTypes">, rule: WorkOkrControlRule): WorkOkrControlRule {
  return { ...rule, anchor: key === "krReviewOpensAt" || key === "krSubmitDeadline" ? "periodEnd" : "periodStart" };
}

function normalizeOffset(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) ? Math.max(-365, Math.min(365, number)) : 0;
}

function normalizeAutoLock(value: unknown): WorkOkrControlSettings["autoLock"] {
  return value === "off" || value === "afterObjectiveDeadline" || value === "afterKrDeadline" ? value : "afterKrDeadline";
}

function normalizeRuleMode(value: unknown): WorkOkrPeriodTypeRuleMode {
  return value === "custom" || value === "disabled" || value === "report_only" ? value : "inherit";
}

function createDefaultDraft(): OkrSettingsDraft {
  return {
    exceptionEnabled: false,
    periodType: null,
    periodDate: null,
    cycleId: null,
    scopeType: "global",
    scopeId: "",
    isLocked: false,
    objectiveSubmitDeadline: null,
    krReviewOpensAt: null,
    krSubmitDeadline: null,
  };
}

function hydrateDraftFromActivePolicy(draft: OkrSettingsDraft, cycles: WorkOkrControlCycleOption[], policy?: WorkOkrControlPolicy) {
  if (!policy) return hydrateDraftCycleType(draft, cycles);
  const cycle = cycles.find((item) => item.id === policy.cycleId);
  return {
    ...draft,
    exceptionEnabled: true,
    periodType: normalizeOkrSettingsPeriodType(cycle?.periodType),
    periodDate: cycle?.startDate ?? draft.periodDate,
    cycleId: policy.cycleId,
    scopeType: policy.scopeType,
    scopeId: policy.scopeId,
    isLocked: policy.isLocked,
    objectiveSubmitDeadline: policy.objectiveSubmitDeadline,
    krReviewOpensAt: policy.krReviewOpensAt,
    krSubmitDeadline: policy.krSubmitDeadline,
  };
}

function hydrateDraftCycleType(draft: OkrSettingsDraft, cycles: WorkOkrControlCycleOption[]) {
  if (!draft.cycleId) return draft;
  const cycle = cycles.find((item) => item.id === draft.cycleId);
  if (!cycle || cycle.periodType === draft.periodType) return draft;
  return { ...draft, periodType: normalizeOkrSettingsPeriodType(cycle.periodType), periodDate: draft.periodDate ?? cycle.startDate };
}

function draftWithPeriodDate(draft: OkrSettingsDraft, cycles: WorkOkrControlCycleOption[], periodType: WorkOkrPeriodType | null, periodDate: string | null): OkrSettingsDraft {
  if (!periodType) return { ...draft, periodType: null, periodDate: null, cycleId: null };
  const cycle = findCycleForDate(cycles, periodType, periodDate);
  return { ...draft, periodType, periodDate, cycleId: cycle?.id ?? null };
}

function findCycleForDate(cycles: WorkOkrControlCycleOption[], periodType: WorkOkrPeriodType | null, periodDate: string | null) {
  if (!periodType || !periodDate) return null;
  return cycles.find((cycle) => cycle.periodType === periodType && cycle.startDate <= periodDate && cycle.endDate >= periodDate) ?? null;
}

function normalizeDateValue(value: unknown) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function todayDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function normalizeOkrSettingsPeriodType(value: unknown): WorkOkrPeriodType | null {
  const text = String(value || "");
  return text === "monthly" || text === "quarterly" || text === "half_year" || text === "yearly" ? text : null;
}

function normalizeScopeType(value: unknown): WorkOkrControlPolicy["scopeType"] {
  if (value === "company" || value === "committee" || value === "department") return value;
  return "global";
}

function normalizedScopeId(scopeType: WorkOkrControlPolicy["scopeType"], scopeId: string) {
  return scopeType === "global" ? "" : scopeId.trim();
}

function policyKey(cycleId: number, scopeType: WorkOkrControlPolicy["scopeType"], scopeId: string) {
  return `${cycleId}:${scopeType}:${normalizedScopeId(scopeType, scopeId)}`;
}
