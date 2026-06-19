import { clearBypassCache } from "./auth";
import { prisma } from "./prisma";

export type SystemConfigDto = {
  conflictStrategy: "union" | "deny_override";
  systemAdminBusinessBypass: boolean;
};

export type UpdateSystemConfigInput = {
  conflictStrategy?: "union" | "deny_override";
  systemAdminBusinessBypass?: boolean;
};

export async function getSystemConfig(): Promise<SystemConfigDto> {
  const [conflictStrategy, bypass] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { key: "conflictStrategy" } }),
    prisma.systemConfig.findUnique({ where: { key: "systemAdminBusinessBypass" } }),
  ]);

  return {
    conflictStrategy: conflictStrategy?.value === "deny_override" ? "deny_override" : "union",
    systemAdminBusinessBypass: bypass?.value !== "false",
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

  if (typeof input.systemAdminBusinessBypass === "boolean") {
    await prisma.systemConfig.upsert({
      where: { key: "systemAdminBusinessBypass" },
      update: { value: input.systemAdminBusinessBypass ? "true" : "false" },
      create: {
        key: "systemAdminBusinessBypass",
        value: input.systemAdminBusinessBypass ? "true" : "false",
      },
    });
    clearBypassCache();
  }

  return { success: true };
}
