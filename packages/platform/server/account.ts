import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";

import {
  buildWecomWebLoginUrl,
  getWecomUserByCode,
  getWecomUserDetail,
} from "./auth/wecom";
import { getCurrentUser } from "./auth/session";
import {
  createToken,
  ensureGrantCache,
  getManageableResourceKeys,
  getPermissionContext,
  getVisibleResourceKeys,
  isKicked,
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

export type WecomLoginResult =
  | { success: true; token: string }
  | { success: false; error: string };

export type DevUserLoginResult =
  | { success: true; token: string; message: string }
  | { success: false; status: number; error: string };

type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export type CurrentSessionResult =
  | { status: "authenticated"; user: CurrentUser }
  | { status: "kicked" }
  | { status: "unauthenticated" };

export type WecomLoginStart = {
  authorizeUrl: string;
  state: string;
};

export async function getCurrentSessionStatus(request: Request): Promise<CurrentSessionResult> {
  const user = await getCurrentUser();
  if (user) return { status: "authenticated", user };
  if (await isKicked(request)) return { status: "kicked" };
  return { status: "unauthenticated" };
}

export function createWecomLoginStart(origin: string, basePath: string): WecomLoginStart {
  const state = randomBytes(24).toString("hex");
  const redirectUri = `${origin}${basePath}/api/auth/wecom/callback`;
  return {
    authorizeUrl: buildWecomWebLoginUrl(redirectUri, state),
    state,
  };
}

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
      canSelectAnyWeek: visibleWrite.has("work.reports"),
      visibleResourceKeys: [...visibleAccess],
      visibleWriteResourceKeys: [...visibleWrite],
      manageableResourceKeys: [...manageableKeys],
    },
  };
}

export async function loginWithWecomCode(code: string): Promise<WecomLoginResult> {
  const { userId: wxUserId, userTicket } = await getWecomUserByCode(code);
  const user = await prisma.user.findUnique({
    where: { wxUserId },
    select: { id: true, name: true, wxUserId: true, canLogin: true, sessionVersion: true },
  });

  if (!user) return { success: false, error: `企业微信账号 ${wxUserId} 尚未绑定` };
  if (!user.canLogin) return { success: false, error: "账号已被停用，请联系管理员" };

  if (userTicket) {
    try {
      const detail = await getWecomUserDetail(userTicket);
      const avatar = detail?.avatar || undefined;
      if (avatar) await prisma.user.update({ where: { id: user.id }, data: { avatar } });
    } catch (error) {
      console.error("Sync WeCom user detail failed", error);
    }
  }

  const token = await createToken({
    userId: user.id,
    wxUserId: user.wxUserId ?? "",
    name: user.name,
    departmentId: 0,
    sessionVersion: user.sessionVersion,
  });

  return { success: true, token };
}

export async function loginWithDevUserId(userId: number): Promise<DevUserLoginResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, sessionVersion: true },
  });

  if (!user) return { success: false, status: 404, error: "User not found" };

  const token = await createToken({
    userId: user.id,
    wxUserId: "",
    name: user.name,
    departmentId: 0,
    sessionVersion: user.sessionVersion,
  });

  return { success: true, token, message: `已登录为 ${user.name}` };
}
