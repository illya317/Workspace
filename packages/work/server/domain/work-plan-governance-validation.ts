import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";

export type WorkPlanGovernanceMigrationCommand = {
  planIds: number[];
  actorUserId: number;
  reason: string;
};

export type WorkOkrSettingsMutationInput = {
  actorUserId?: number | null;
  governanceMigration?: unknown;
  settings?: unknown;
  exception?: unknown;
  [key: string]: unknown;
};

type WorkOkrSettingsMutationCommand = { kind: "control_settings"; input: WorkOkrSettingsMutationInput };

export function validateWorkOkrSettingsMutation(
  input: WorkOkrSettingsMutationInput,
): DomainValidationResult<WorkOkrSettingsMutationCommand> {
  if (input.governanceMigration !== undefined) {
    return failCommand("存量计划治理迁移已停用；流程策略按当前配置直接生效");
  }
  return okCommand({ kind: "control_settings", input });
}

export function validateWorkPlanGovernanceMigrationCommand(input: {
  planIds: unknown;
  actorUserId?: number | null;
  reason: unknown;
}): DomainValidationResult<WorkPlanGovernanceMigrationCommand> {
  if (!Number.isInteger(input.actorUserId) || Number(input.actorUserId) <= 0) {
    return failCommand("登录状态无效", 401);
  }
  if (!Array.isArray(input.planIds)) return failCommand("请选择需要迁移治理规则的 OKR 计划");
  const normalizedIds = input.planIds.map(Number);
  if (normalizedIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    return failCommand("OKR 计划 ID 无效");
  }
  const planIds = Array.from(new Set(normalizedIds));
  if (!planIds.length) return failCommand("请选择需要迁移治理规则的 OKR 计划");
  if (planIds.length > 100) return failCommand("单次最多迁移 100 个 OKR 计划");
  if (typeof input.reason !== "string" || !input.reason.trim()) {
    return failCommand("治理规则迁移原因不能为空");
  }
  return okCommand({
    planIds,
    actorUserId: Number(input.actorUserId),
    reason: input.reason.trim(),
  });
}

export function approvalPayloadReferencesWorkPlan(payloadJson: string, planId: number) {
  try {
    return containsWorkPlanReference(JSON.parse(payloadJson), planId);
  } catch {
    return payloadJson.includes(`"planId":${planId}`)
      || payloadJson.includes(`"workPlanId":${planId}`);
  }
}

function containsWorkPlanReference(value: unknown, planId: number): boolean {
  if (Array.isArray(value)) return value.some((item) => containsWorkPlanReference(item, planId));
  const record = plainRecord(value);
  if (!record) return false;
  return Object.entries(record).some(([key, item]) => (
    (key === "planId" || key === "workPlanId") && Number(item) === planId
  ) || containsWorkPlanReference(item, planId));
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
