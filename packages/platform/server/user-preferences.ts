import { randomBytes } from "node:crypto";

import { prisma } from "./prisma";

export interface RoutineItem {
  plan: string;
  nextGoal?: string;
}

function generateApiKey(): string {
  return randomBytes(24).toString("hex");
}

function parseRoutineItems(value: string | null): RoutineItem[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is RoutineItem => (
        item &&
        typeof item === "object" &&
        typeof item.plan === "string" &&
        (item.nextGoal === undefined || typeof item.nextGoal === "string")
      ));
  } catch {
    return [];
  }
}

export async function getUserApiKey(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { apiKey: true },
  });
  return user?.apiKey || null;
}

export async function rotateUserApiKey(userId: number) {
  const apiKey = generateApiKey();
  await prisma.user.update({
    where: { id: userId },
    data: { apiKey },
  });
  return apiKey;
}

export async function getUserRoutineItems(userId: number): Promise<RoutineItem[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { routineItems: true },
  });
  return parseRoutineItems(user?.routineItems ?? null);
}

export async function updateUserRoutineItems(userId: number, routineItems: RoutineItem[]) {
  await prisma.user.update({
    where: { id: userId },
    data: { routineItems: JSON.stringify(routineItems) },
  });
}
