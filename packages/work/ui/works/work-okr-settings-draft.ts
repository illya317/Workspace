import type {
  WorkOkrControlCycleOption,
  WorkOkrControlPolicy,
  WorkOkrControlRule,
  WorkOkrControlSettings,
  WorkOkrPeriodType,
  WorkOkrPeriodTypeRuleMode,
} from "./types";

export type OkrSettingsDraft = {
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

export function normalizeOkrRuleOffset(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) ? Math.max(-365, Math.min(365, number)) : 0;
}

export function normalizeOkrRuleMode(value: unknown): WorkOkrPeriodTypeRuleMode {
  return value === "custom" || value === "disabled" || value === "report_only" ? value : "inherit";
}

export function formatOkrControlRule(rule: WorkOkrControlRule) {
  const anchor = rule.anchor === "periodStart" ? "周期开始" : "周期结束";
  if (rule.offsetDays === 0) return anchor;
  return `${anchor}${rule.offsetDays > 0 ? "后" : "前"} ${Math.abs(rule.offsetDays)} 天`;
}

export function okrRuleWithFixedAnchor(
  key: keyof Omit<WorkOkrControlSettings, "enabled" | "autoLock" | "periodTypes">,
  rule: WorkOkrControlRule,
): WorkOkrControlRule {
  return { ...rule, anchor: key === "krReviewOpensAt" || key === "krSubmitDeadline" ? "periodEnd" : "periodStart" };
}

export function createDefaultOkrSettingsDraft(): OkrSettingsDraft {
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

export function hydrateOkrSettingsDraft(
  draft: OkrSettingsDraft,
  cycles: WorkOkrControlCycleOption[],
  policy?: WorkOkrControlPolicy,
) {
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

export function draftWithOkrPeriodDate(
  draft: OkrSettingsDraft,
  cycles: WorkOkrControlCycleOption[],
  periodType: WorkOkrPeriodType | null,
  periodDate: string | null,
): OkrSettingsDraft {
  if (!periodType) return { ...draft, periodType: null, periodDate: null, cycleId: null };
  const cycle = findCycleForDate(cycles, periodType, periodDate);
  return { ...draft, periodType, periodDate, cycleId: cycle?.id ?? null };
}

export function normalizeOkrDateValue(value: unknown) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

export function todayOkrDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function normalizeOkrSettingsPeriodType(value: unknown): WorkOkrPeriodType | null {
  const text = String(value || "");
  return text === "monthly" || text === "quarterly" || text === "half_year" || text === "yearly" ? text : null;
}

export function normalizeOkrScopeType(value: unknown): WorkOkrControlPolicy["scopeType"] {
  if (value === "company" || value === "committee" || value === "department") return value;
  return "global";
}

export function normalizedOkrScopeId(scopeType: WorkOkrControlPolicy["scopeType"], scopeId: string) {
  return scopeType === "global" ? "" : scopeId.trim();
}

export function workOkrPolicyKey(cycleId: number, scopeType: WorkOkrControlPolicy["scopeType"], scopeId: string) {
  return `${cycleId}:${scopeType}:${normalizedOkrScopeId(scopeType, scopeId)}`;
}

export function mergeSavedWorkOkrPolicy(
  policies: WorkOkrControlPolicy[],
  saved: WorkOkrControlPolicy | null,
  deleted: { cycleId: number; scopeType: string; scopeId: string } | null,
) {
  const deletedKey = deleted && isOkrScopeType(deleted.scopeType)
    ? workOkrPolicyKey(deleted.cycleId, deleted.scopeType, deleted.scopeId)
    : null;
  const savedKey = saved ? workOkrPolicyKey(saved.cycleId, saved.scopeType, saved.scopeId) : null;
  const remaining = policies.filter((policy) => {
    const key = workOkrPolicyKey(policy.cycleId, policy.scopeType, policy.scopeId);
    return key !== deletedKey && key !== savedKey;
  });
  return saved ? [saved, ...remaining] : remaining;
}

function hydrateDraftCycleType(draft: OkrSettingsDraft, cycles: WorkOkrControlCycleOption[]) {
  if (!draft.cycleId) return draft;
  const cycle = cycles.find((item) => item.id === draft.cycleId);
  if (!cycle || cycle.periodType === draft.periodType) return draft;
  return { ...draft, periodType: normalizeOkrSettingsPeriodType(cycle.periodType), periodDate: draft.periodDate ?? cycle.startDate };
}

export function findCycleForDate(
  cycles: WorkOkrControlCycleOption[],
  periodType: WorkOkrPeriodType | null,
  periodDate: string | null,
) {
  if (!periodType || !periodDate) return null;
  return cycles.find((cycle) => cycle.periodType === periodType && cycle.startDate <= periodDate && cycle.endDate >= periodDate) ?? null;
}

function isOkrScopeType(value: string): value is WorkOkrControlPolicy["scopeType"] {
  return value === "global" || value === "company" || value === "committee" || value === "department";
}
