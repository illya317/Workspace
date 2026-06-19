import bcrypt from "bcryptjs";

import {
  createToken,
  ensureGrantCache,
  getManageableResourceKeys,
  getPermissionContext,
  getVisibleResourceKeys,
} from "./auth";
import { prisma } from "./prisma";
import { checkBruteForce, recordAttempt } from "./security";

export type ChangePasswordResult =
  | { success: true }
  | { success: false; status: number; error: string };

export type PasswordLoginResult =
  | {
      success: true;
      token: string;
      user: {
        id: number;
        name: string;
        departmentId: number;
        isWorkListAdmin: boolean;
        isSuperAdmin: boolean;
        canSelectAnyWeek: boolean;
        visibleResourceKeys: string[];
        visibleWriteResourceKeys: string[];
        manageableResourceKeys: string[];
      };
    }
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

export async function loginWithPassword(
  username: string,
  password: string,
  ip: string,
): Promise<PasswordLoginResult> {
  const brute = await checkBruteForce(username, ip);
  if (brute.blocked) {
    return {
      success: false,
      status: 429,
      error: `尝试次数过多，请${brute.retryAfter}分钟后再试`,
    };
  }

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      name: true,
      wxUserId: true,
      password: true,
      canLogin: true,
      sessionVersion: true,
    },
  });

  if (!user?.password || !bcrypt.compareSync(password, user.password)) {
    await recordAttempt(username, ip, false);
    const { remaining } = await checkBruteForce(username, ip);
    const hint = remaining && remaining > 0 ? `（剩余${remaining}次尝试）` : "";
    return { success: false, status: 401, error: `账号或密码错误${hint}` };
  }

  if (!user.canLogin) {
    await recordAttempt(username, ip, false);
    return { success: false, status: 403, error: "账号已被停用，请联系管理员" };
  }

  await recordAttempt(username, ip, true);

  const token = await createToken({
    userId: user.id,
    wxUserId: user.wxUserId ?? "",
    name: user.name,
    departmentId: 0,
    sessionVersion: user.sessionVersion,
  });

  const ctx = await getPermissionContext(user.id);
  await ensureGrantCache(ctx);
  const [visibleAccess, visibleWrite] = await Promise.all([
    getVisibleResourceKeys(ctx, "access"),
    getVisibleResourceKeys(ctx, "write"),
  ]);
  const manageableKeys = await getManageableResourceKeys(user.id);
  const isAdmin = ctx.isAdmin;

  return {
    success: true,
    token,
    user: {
      id: user.id,
      name: user.name,
      departmentId: 0,
      isWorkListAdmin: isAdmin,
      isSuperAdmin: isAdmin,
      canSelectAnyWeek: visibleWrite.has("work.report"),
      visibleResourceKeys: [...visibleAccess],
      visibleWriteResourceKeys: [...visibleWrite],
      manageableResourceKeys: [...manageableKeys],
    },
  };
}
