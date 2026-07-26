export const PROJECT_ROLES = ["负责人", "执行负责", "支持协作", "咨询参与", "知会"] as const;

export type ProjectRoleOption = (typeof PROJECT_ROLES)[number];
