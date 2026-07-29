import { prisma } from "@workspace/platform/server/prisma";

export async function findOkrPlanForCycle(input: {
  targetType: string;
  targetId: number;
  okrCycleId: number;
  currentPlanId?: number | null;
}) {
  return prisma.workPlan.findFirst({
    where: {
      targetType: input.targetType,
      targetId: input.targetId,
      kind: "okr",
      okrCycleId: input.okrCycleId,
      isArchived: false,
      ...(input.currentPlanId ? { id: { not: input.currentPlanId } } : {}),
    },
    select: { title: true },
  });
}
