import "server-only";
import { prisma } from "@workspace/platform/server/prisma";

export const ROOT_ADMIN_USERNAME = "admin";

export function isRootAdminUsername(username: string | null | undefined): boolean {
  return username === ROOT_ADMIN_USERNAME;
}

export async function isRootAdminUser(userId: number): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, canLogin: true },
  });
  return Boolean(user?.canLogin && isRootAdminUsername(user.username));
}
