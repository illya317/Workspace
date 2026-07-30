import { prisma } from "./prisma";
import {
  normalizeAgentAllowedPermissionActions,
  type AgentAllowedPermissionAction,
} from "@workspace/platform/agent-permission-policy";
import {
  BUSINESS_CODE_CONFIG_KEY,
  defaultBusinessCodeConfig,
  normalizeBusinessCodeConfig,
  type BusinessCodeConfig,
} from "@workspace/platform/business-code-config";
import { getTenantProfile } from "./tenant-config";
import { upsertBusinessCodeRule } from "./business-codes/index";

export type SystemConfigDto = {
  conflictStrategy: "union" | "deny_override";
  agentAllowedActions: AgentAllowedPermissionAction[];
  businessCodeConfig: BusinessCodeConfig;
};

export type UpdateSystemConfigInput = {
  conflictStrategy?: "union" | "deny_override";
  agentAllowedActions?: AgentAllowedPermissionAction[];
  businessCodeConfig?: BusinessCodeConfig;
};

type SystemConfigClient = Pick<typeof prisma, "systemConfig">;

export async function getSystemConfig(
  client: SystemConfigClient = prisma,
): Promise<SystemConfigDto> {
  const rows = await client.systemConfig.findMany({
    where: { key: { in: ["conflictStrategy", "agentAllowedActions", BUSINESS_CODE_CONFIG_KEY] } },
  });
  const values = new Map(rows.map((row) => [row.key, row.value]));
  let storedAgentActions: unknown;
  let storedBusinessCodeConfig: unknown;
  try {
    storedAgentActions = JSON.parse(values.get("agentAllowedActions") ?? "null");
  } catch {
    storedAgentActions = null;
  }
  try {
    storedBusinessCodeConfig = JSON.parse(values.get(BUSINESS_CODE_CONFIG_KEY) ?? "null");
  } catch {
    storedBusinessCodeConfig = null;
  }
  const tenantWork = getTenantProfile().work;
  const businessCodeDefaults = defaultBusinessCodeConfig(tenantWork);

  return {
    conflictStrategy: values.get("conflictStrategy") === "deny_override" ? "deny_override" : "union",
    agentAllowedActions: normalizeAgentAllowedPermissionActions(storedAgentActions),
    businessCodeConfig: normalizeBusinessCodeConfig(storedBusinessCodeConfig, businessCodeDefaults),
  };
}

export async function getBusinessCodeConfig(client: SystemConfigClient = prisma) {
  return (await getSystemConfig(client)).businessCodeConfig;
}

export async function updateSystemConfig(input: UpdateSystemConfigInput) {
  if (input.conflictStrategy) {
    await prisma.systemConfig.upsert({
      where: { key: "conflictStrategy" },
      update: { value: input.conflictStrategy },
      create: { key: "conflictStrategy", value: input.conflictStrategy },
    });
  }

  if (input.agentAllowedActions !== undefined) {
    const value = JSON.stringify(normalizeAgentAllowedPermissionActions(input.agentAllowedActions, []));
    await prisma.systemConfig.upsert({
      where: { key: "agentAllowedActions" },
      update: { value },
      create: { key: "agentAllowedActions", value },
    });
  }

  if (input.businessCodeConfig !== undefined) {
    const tenantWork = getTenantProfile().work;
    const normalized = normalizeBusinessCodeConfig(
      input.businessCodeConfig,
      defaultBusinessCodeConfig(tenantWork),
    );
    const value = JSON.stringify(normalized);
    await prisma.$transaction(async (tx) => {
      await tx.systemConfig.upsert({
        where: { key: BUSINESS_CODE_CONFIG_KEY },
        update: { value },
        create: { key: BUSINESS_CODE_CONFIG_KEY, value },
      });
      await upsertBusinessCodeRule(tx, {
        objectKey: "finance.asset",
        config: normalized.financeAsset,
      });
    });
  }

  return { success: true };
}
