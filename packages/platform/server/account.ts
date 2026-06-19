import bcrypt from "bcryptjs";

import { prisma } from "./prisma";

export type ChangePasswordResult =
  | { success: true }
  | { success: false; status: number; error: string };

export async function changeUserPassword(
  userId: number,
  oldPassword: string,
  newPassword: string,
): Promise<ChangePasswordResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true },
  });

  if (!user?.password || !bcrypt.compareSync(oldPassword, user.password)) {
    return { success: false, status: 401, error: "旧密码错误" };
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      password: bcrypt.hashSync(newPassword, 10),
      sessionVersion: { increment: 1 },
    },
  });

  return { success: true };
}

export async function isUserSessionActive(userId: number, sessionVersion: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { canLogin: true, sessionVersion: true },
  });
  return Boolean(user?.canLogin && user.sessionVersion === sessionVersion);
}
