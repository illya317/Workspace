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
  isRootAdminUsername,
  isKicked,
} from "./auth";
import { prisma } from "./prisma";
import { checkBruteForce, recordAttempt } from "./security";

export type ChangePasswordResult =
  | { success: true }
  | { success: false; status: number; error: string };

export type ChangeAvatarResult =
  | { success: true }
  | { success: false; status: number; error: string };

export type ChangeProfileResult =
  | { success: true }
  | { success: false; status: number; error: string };

export type PasswordLoginResult =
  | {
      success: true;
      token: string;
      user: {
        id: number;
        nickname: string;
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

export async function changeUserProfile(
  userId: number,
  input: { username: string; nickname: string },
): Promise<ChangeProfileResult> {
  const existing = await prisma.user.findFirst({
    where: {
      username: input.username,
      NOT: { id: userId },
    },
    select: { id: true },
  });
  if (existing) {
    return { success: false, status: 409, error: "用户名已被占用" };
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      username: input.username,
      nickname: input.nickname,
    },
  });

  return { success: true };
}

export async function changeUserAvatar(
  userId: number,
  avatar: string | null,
): Promise<ChangeAvatarResult> {
  await prisma.user.update({
    where: { id: userId },
    data: { avatar },
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
      nickname: true,
      username: true,
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
    nickname: user.nickname,
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
  const isAdmin = isRootAdminUsername(user.username);
  const { RESOURCE_KEYS } = await import("@workspace/platform/resources");
  const activeResourceKeySet = new Set(RESOURCE_KEYS);
  const activeVisibleAccess = [...visibleAccess].filter((key) => activeResourceKeySet.has(key));
  const activeVisibleWrite = [...visibleWrite].filter((key) => activeResourceKeySet.has(key));
  const allResourceKeys = new Set([
    ...RESOURCE_KEYS,
    ...activeVisibleAccess,
    ...activeVisibleWrite,
  ]);

  return {
    success: true,
    token,
    user: {
      id: user.id,
      nickname: user.nickname,
      departmentId: 0,
      isWorkListAdmin: isAdmin,
      isSuperAdmin: isAdmin,
      canSelectAnyWeek: isAdmin || visibleWrite.has("work.reports"),
      visibleResourceKeys: isAdmin ? [...allResourceKeys] : activeVisibleAccess,
      visibleWriteResourceKeys: isAdmin ? [...allResourceKeys] : activeVisibleWrite,
      manageableResourceKeys: isAdmin ? [...new Set([...manageableKeys, ...RESOURCE_KEYS])] : [...manageableKeys],
    },
  };
}

export async function loginWithWecomCode(code: string): Promise<WecomLoginResult> {
  const { userId: wxUserId, userTicket } = await getWecomUserByCode(code);
  const user = await prisma.user.findUnique({
    where: { wxUserId },
    select: { id: true, nickname: true, wxUserId: true, canLogin: true, sessionVersion: true },
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
    nickname: user.nickname,
    departmentId: 0,
    sessionVersion: user.sessionVersion,
  });

  return { success: true, token };
}

export async function loginWithDevUserId(userId: number): Promise<DevUserLoginResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, nickname: true, sessionVersion: true },
  });

  if (!user) return { success: false, status: 404, error: "User not found" };

  const token = await createToken({
    userId: user.id,
    wxUserId: "",
    nickname: user.nickname,
    departmentId: 0,
    sessionVersion: user.sessionVersion,
  });

  return { success: true, token, message: `已登录为 ${user.nickname}` };
}
