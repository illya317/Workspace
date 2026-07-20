import { randomBytes } from "crypto";

import {
  buildWecomInAppLoginUrl,
  buildWecomWebLoginUrl,
  getWecomUserByCode,
  getWecomUserDetail,
} from "./auth/wecom";
import { getCurrentUser } from "./auth/session";
import {
  createToken,
  isKicked,
} from "./auth";
import { findUserByPersonalApiKey, hashPersonalApiKey } from "./personal-api-key";
import { prisma } from "./prisma";
import { checkBruteForce, recordAttempt } from "./security";

export type ChangeAvatarResult =
  | { success: true }
  | { success: false; status: number; error: string };

export type ChangeProfileResult =
  | { success: true; profile: AccountProfile }
  | { success: false; status: number; error: string };

export type AccountProfile = {
  username: string;
  alias: string | null;
  phone: string | null;
  employeeId: string | null;
};

export type ApiKeyLoginResult =
  | {
      success: true;
      token: string;
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

export function createWecomLoginStart(
  origin: string,
  basePath: string,
  mode: "web" | "in-app" = "web",
): WecomLoginStart {
  const state = randomBytes(24).toString("hex");
  const redirectUri = `${origin}${basePath}/api/auth/wecom/callback`;
  return {
    authorizeUrl: mode === "in-app"
      ? buildWecomInAppLoginUrl(redirectUri, state)
      : buildWecomWebLoginUrl(redirectUri, state),
    state,
  };
}

export async function changeUserProfile(
  userId: number,
  input: { username: string; alias?: string | null; phone?: string | null },
): Promise<ChangeProfileResult> {
  const username = input.username.trim();
  const duplicate = await prisma.user.findFirst({
    where: { username, id: { not: userId } },
    select: { id: true },
  });
  if (duplicate) return { success: false, status: 409, error: "用户名已被使用" };

  const profile = await prisma.user.update({
    where: { id: userId },
    data: {
      username,
      ...(input.alias !== undefined ? { alias: normalizeOptionalProfileText(input.alias) } : {}),
      ...(input.phone !== undefined ? { phone: normalizePhoneText(input.phone) } : {}),
    },
    select: {
      username: true,
      alias: true,
      phone: true,
      employeeId: true,
    },
  });

  return { success: true, profile };
}

export async function getUserAccountProfile(userId: number): Promise<AccountProfile> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      username: true,
      alias: true,
      phone: true,
      employeeId: true,
    },
  });
  if (!user) {
    return {
      username: "",
      alias: null,
      phone: null,
      employeeId: null,
    };
  }
  return user;
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

function normalizeOptionalProfileText(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizePhoneText(value: string | null | undefined) {
  const text = String(value ?? "").replace(/\D/g, "").slice(0, 11);
  return text || null;
}

export async function isUserSessionActive(userId: number, sessionVersion: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { canLogin: true, sessionVersion: true },
  });
  return Boolean(user?.canLogin && user.sessionVersion === sessionVersion);
}

export async function loginWithApiKey(
  username: string,
  apiKey: string,
  ip: string,
): Promise<ApiKeyLoginResult> {
  const attemptKey = `${username}:${hashPersonalApiKey(apiKey)}`;
  const brute = await checkBruteForce(attemptKey, ip);
  if (brute.blocked) {
    return {
      success: false,
      status: 429,
      error: `尝试次数过多，请${brute.retryAfter}分钟后再试`,
    };
  }

  const user = await findUserByPersonalApiKey(apiKey);
  if (!user || user.username !== username) {
    await recordAttempt(attemptKey, ip, false);
    const { remaining } = await checkBruteForce(attemptKey, ip);
    const hint = remaining && remaining > 0 ? `（剩余${remaining}次尝试）` : "";
    return { success: false, status: 401, error: `账号或密码错误${hint}` };
  }

  if (!user.canLogin) {
    await recordAttempt(attemptKey, ip, false);
    return { success: false, status: 403, error: "账号已被停用，请联系管理员" };
  }

  await recordAttempt(attemptKey, ip, true);

  const token = await createToken({
    userId: user.id,
    wxUserId: user.wxUserId ?? "",
    departmentId: 0,
    sessionVersion: user.sessionVersion,
  });

  return {
    success: true,
    token,
  };
}

export async function loginWithWecomCode(code: string): Promise<WecomLoginResult> {
  const { userId: wxUserId, userTicket } = await getWecomUserByCode(code);
  const user = await prisma.user.findUnique({
    where: { wxUserId },
    select: { id: true, wxUserId: true, canLogin: true, sessionVersion: true },
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
    departmentId: 0,
    sessionVersion: user.sessionVersion,
  });

  return { success: true, token };
}

export async function loginWithDevUserId(userId: number): Promise<DevUserLoginResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, sessionVersion: true },
  });

  if (!user) return { success: false, status: 404, error: "User not found" };

  const token = await createToken({
    userId: user.id,
    wxUserId: "",
    departmentId: 0,
    sessionVersion: user.sessionVersion,
  });

  return { success: true, token, message: `已登录为 ${user.username}` };
}
