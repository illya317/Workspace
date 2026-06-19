export const WORK_PLAN_ROLES = ["负责人", "执行负责", "支持协作", "咨询参与", "知会"] as const;

export type WorkPlanRole = (typeof WORK_PLAN_ROLES)[number];
