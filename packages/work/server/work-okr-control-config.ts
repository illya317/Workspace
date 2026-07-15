import { prisma } from "@workspace/platform/server/prisma";

export type WorkOkrControlRuleAnchor = "periodStart" | "periodEnd";
export type WorkOkrControlRule = { anchor: WorkOkrControlRuleAnchor; offsetDays: number };
export type WorkOkrPeriodType = "yearly" | "half_year" | "quarterly" | "monthly" | "weekly";
export type WorkOkrPeriodTypeRule = {
  mode: "inherit" | "custom" | "disabled" | "report_only";
  objectiveOpensAt?: WorkOkrControlRule;
  objectiveSubmitDeadline?: WorkOkrControlRule;
  krReviewOpensAt?: WorkOkrControlRule;
  krSubmitDeadline?: WorkOkrControlRule;
};
export type WorkOkrControlSettings = {
  enabled: boolean;
  objectiveOpensAt: WorkOkrControlRule;
  objectiveSubmitDeadline: WorkOkrControlRule;
  krReviewOpensAt: WorkOkrControlRule;
  krSubmitDeadline: WorkOkrControlRule;
  autoLock: "off" | "afterObjectiveDeadline" | "afterKrDeadline";
  periodTypes: Record<WorkOkrPeriodType, WorkOkrPeriodTypeRule>;
};

export const WORK_OKR_CONTROL_SETTINGS_KEY = "work.okr.control.settings";
export const WORK_OKR_PERIOD_TYPES: WorkOkrPeriodType[] = ["yearly", "half_year", "quarterly", "monthly", "weekly"];

const DEFAULT_WORK_OKR_CONTROL_SETTINGS: WorkOkrControlSettings = {
  enabled: true,
  objectiveOpensAt: { anchor: "periodStart", offsetDays: -7 },
  objectiveSubmitDeadline: { anchor: "periodStart", offsetDays: 0 },
  krReviewOpensAt: { anchor: "periodEnd", offsetDays: 0 },
  krSubmitDeadline: { anchor: "periodEnd", offsetDays: 14 },
  autoLock: "afterKrDeadline",
  periodTypes: {
    yearly: { mode: "inherit" },
    half_year: { mode: "inherit" },
    quarterly: { mode: "inherit" },
    monthly: { mode: "inherit" },
    weekly: { mode: "report_only" },
  },
};

export async function getWorkOkrControlSettings() {
  return (await getWorkOkrControlSettingsState()).settings;
}

export async function getWorkOkrControlSettingsState() {
  const [row, revision] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { key: WORK_OKR_CONTROL_SETTINGS_KEY } }),
    prisma.workOkrControlRevision.findFirst({
      select: { version: true },
      orderBy: { version: "desc" },
    }),
  ]);
  if (!row) return { settings: DEFAULT_WORK_OKR_CONTROL_SETTINGS, version: revision?.version ?? 1 };
  try {
    return { settings: normalizeWorkOkrControlSettings(JSON.parse(row.value)), version: revision?.version ?? 1 };
  } catch {
    return { settings: DEFAULT_WORK_OKR_CONTROL_SETTINGS, version: revision?.version ?? 1 };
  }
}

export function normalizeWorkOkrControlSettings(value: unknown): WorkOkrControlSettings {
  const source = value && typeof value === "object" ? value as Partial<WorkOkrControlSettings> : {};
  const periodSource = source.periodTypes && typeof source.periodTypes === "object" ? source.periodTypes : {};
  return {
    enabled: source.enabled !== false,
    objectiveOpensAt: normalizeRule(source.objectiveOpensAt, DEFAULT_WORK_OKR_CONTROL_SETTINGS.objectiveOpensAt, "periodStart"),
    objectiveSubmitDeadline: normalizeRule(source.objectiveSubmitDeadline, DEFAULT_WORK_OKR_CONTROL_SETTINGS.objectiveSubmitDeadline, "periodStart"),
    krReviewOpensAt: normalizeRule(source.krReviewOpensAt, DEFAULT_WORK_OKR_CONTROL_SETTINGS.krReviewOpensAt, "periodEnd"),
    krSubmitDeadline: normalizeRule(source.krSubmitDeadline, DEFAULT_WORK_OKR_CONTROL_SETTINGS.krSubmitDeadline, "periodEnd"),
    autoLock: source.autoLock === "off" || source.autoLock === "afterObjectiveDeadline" || source.autoLock === "afterKrDeadline"
      ? source.autoLock
      : DEFAULT_WORK_OKR_CONTROL_SETTINGS.autoLock,
    periodTypes: Object.fromEntries(WORK_OKR_PERIOD_TYPES.map((type) => {
      const item = (periodSource as Record<string, unknown>)[type];
      return [type, normalizePeriodTypeRule(item, DEFAULT_WORK_OKR_CONTROL_SETTINGS.periodTypes[type])];
    })) as WorkOkrControlSettings["periodTypes"],
  };
}

function normalizePeriodTypeRule(value: unknown, fallback: WorkOkrPeriodTypeRule): WorkOkrPeriodTypeRule {
  const source = value && typeof value === "object" ? value as Partial<WorkOkrPeriodTypeRule> : {};
  const mode = source.mode === "inherit" || source.mode === "custom" || source.mode === "disabled" || source.mode === "report_only"
    ? source.mode
    : fallback.mode;
  return {
    mode,
    objectiveOpensAt: mode === "custom" ? normalizeRule(source.objectiveOpensAt, DEFAULT_WORK_OKR_CONTROL_SETTINGS.objectiveOpensAt, "periodStart") : undefined,
    objectiveSubmitDeadline: mode === "custom" ? normalizeRule(source.objectiveSubmitDeadline, DEFAULT_WORK_OKR_CONTROL_SETTINGS.objectiveSubmitDeadline, "periodStart") : undefined,
    krReviewOpensAt: mode === "custom" ? normalizeRule(source.krReviewOpensAt, DEFAULT_WORK_OKR_CONTROL_SETTINGS.krReviewOpensAt, "periodEnd") : undefined,
    krSubmitDeadline: mode === "custom" ? normalizeRule(source.krSubmitDeadline, DEFAULT_WORK_OKR_CONTROL_SETTINGS.krSubmitDeadline, "periodEnd") : undefined,
  };
}

function normalizeRule(
  value: unknown,
  fallback: WorkOkrControlRule,
  fixedAnchor: WorkOkrControlRuleAnchor,
): WorkOkrControlRule {
  const source = value && typeof value === "object" ? value as Partial<WorkOkrControlRule> : {};
  if (source.anchor && source.anchor !== fixedAnchor) return fallback;
  const offsetDays = Number(source.offsetDays);
  return {
    anchor: fixedAnchor,
    offsetDays: Number.isInteger(offsetDays) && offsetDays >= -365 && offsetDays <= 365 ? offsetDays : fallback.offsetDays,
  };
}
