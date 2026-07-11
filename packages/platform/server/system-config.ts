import { prisma } from "./prisma";

export type SystemConfigDto = {
  conflictStrategy: "union" | "deny_override";
};

export type UpdateSystemConfigInput = {
  conflictStrategy?: "union" | "deny_override";
};

export async function getSystemConfig(): Promise<SystemConfigDto> {
  const conflictStrategy = await prisma.systemConfig.findUnique({ where: { key: "conflictStrategy" } });

  return {
    conflictStrategy: conflictStrategy?.value === "deny_override" ? "deny_override" : "union",
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

  return { success: true };
}
