import "server-only";
import { prisma, type Prisma } from "@workspace/platform/server/prisma";

export const ROOT_ADMIN_USERNAME = "admin";
export const ROOT_ADMIN_ACTOR_NAME = "管理员";

export function isRootAdminUsername(username: string | null | undefined): boolean {
  return username === ROOT_ADMIN_USERNAME;
}

export async function isRootAdminUser(
  userId: number,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<boolean> {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { username: true, canLogin: true },
  });
  if (!user?.canLogin) return false;
  return isRootAdminUsername(user.username);
}
