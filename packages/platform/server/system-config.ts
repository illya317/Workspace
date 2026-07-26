import { prisma } from "./prisma";
import {
  normalizeAgentAllowedPermissionActions,
  type AgentAllowedPermissionAction,
} from "@workspace/platform/agent-permission-policy";

export type SystemConfigDto = {
  conflictStrategy: "union" | "deny_override";
  agentAllowedActions: AgentAllowedPermissionAction[];
};

export type UpdateSystemConfigInput = {
  conflictStrategy?: "union" | "deny_override";
  agentAllowedActions?: AgentAllowedPermissionAction[];
};

export async function getSystemConfig(): Promise<SystemConfigDto> {
  const rows = await prisma.systemConfig.findMany({
    where: { key: { in: ["conflictStrategy", "agentAllowedActions"] } },
  });
  const values = new Map(rows.map((row) => [row.key, row.value]));
  let storedAgentActions: unknown;
  try {
    storedAgentActions = JSON.parse(values.get("agentAllowedActions") ?? "null");
  } catch {
    storedAgentActions = null;
  }

  return {
    conflictStrategy: values.get("conflictStrategy") === "deny_override" ? "deny_override" : "union",
    agentAllowedActions: normalizeAgentAllowedPermissionActions(storedAgentActions),
  };
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

  return { success: true };
}
