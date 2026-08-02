import { prisma } from "@workspace/platform/server/prisma";

export async function findPositionDescriptionOwner(descriptionId: number) {
  return prisma.position.findFirst({
    where: { positionDescriptionId: descriptionId },
    select: { id: true },
  });
}
