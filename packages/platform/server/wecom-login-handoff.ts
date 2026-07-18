import "server-only";

import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import { authenticateWithWecomCode } from "./account";
import { createToken } from "./auth-token";
import { buildWecomInAppLoginUrl } from "./auth/wecom";
import { prisma } from "./prisma";

export const WECOM_LOGIN_HANDOFF_COOKIE = "wecom_login_handoff";
export const WECOM_LOGIN_HANDOFF_TTL_SECONDS = 5 * 60;
const WECOM_LOGIN_HANDOFF_MAX_ATTEMPTS = 5;

type CreateWecomLoginHandoffInput = {
  origin: string;
  basePath: string;
  nextPath?: string | null;
};

export type ConsumeWecomLoginHandoffResult =
  | { status: "pending" }
  | { status: "awaiting_return" }
  | { status: "authenticated"; token: string; nextPath: string }
  | { status: "error"; error: string; httpStatus: number; retryable: boolean };

type ConsumeWecomLoginHandoffInput = {
  cookieValue: string | null;
  returnToken?: string | null;
  verificationCode?: string | null;
};

function randomToken(byteLength = 32) {
  return randomBytes(byteLength).toString("base64url");
}

function randomVerificationCode() {
  return randomInt(0, 100_000_000).toString().padStart(8, "0");
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function equalHash(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function normalizeWecomHandoffNextPath(value: string | null | undefined, basePath: string) {
  const nextPath = value?.trim();
  if (!nextPath || !nextPath.startsWith(`${basePath}/`) || nextPath.startsWith("//")) {
    return `${basePath}/portal`;
  }
  return nextPath;
}

export function buildWecomAppLaunchUrl(authorizeUrl: string) {
  const launchUrl = new URL("wxwork://openurl");
  launchUrl.searchParams.set("url", authorizeUrl);
  return launchUrl.toString();
}

export async function createWecomLoginHandoff(input: CreateWecomLoginHandoffInput) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + WECOM_LOGIN_HANDOFF_TTL_SECONDS * 1000);
  const id = randomToken(24);
  const browserSecret = randomToken();
  const oauthState = randomToken();
  const nextPath = normalizeWecomHandoffNextPath(input.nextPath, input.basePath);
  const callbackUrl = `${input.origin}${input.basePath}/api/auth/wecom/handoff/callback`;
  const authorizeUrl = buildWecomInAppLoginUrl(callbackUrl, oauthState);

  await prisma.wecomLoginHandoff.deleteMany({ where: { expiresAt: { lte: now } } });
  await prisma.wecomLoginHandoff.create({
    data: {
      id,
      browserSecretHash: sha256(browserSecret),
      oauthStateHash: sha256(oauthState),
      nextPath,
      expiresAt,
    },
  });

  return {
    launchUrl: buildWecomAppLaunchUrl(authorizeUrl),
    cookieValue: `${id}.${browserSecret}`,
    expiresAt,
  };
}

export async function approveWecomLoginHandoff(oauthState: string, code: string) {
  const oauthStateHash = sha256(oauthState);
  const now = new Date();
  const handoff = await prisma.wecomLoginHandoff.findUnique({
    where: { oauthStateHash },
    select: { id: true, approvedAt: true, consumedAt: true, expiresAt: true },
  });

  if (!handoff || handoff.expiresAt <= now || handoff.consumedAt) {
    return { success: false as const, error: "企业微信登录请求已失效，请返回浏览器重试" };
  }
  if (handoff.approvedAt) {
    return { success: false as const, error: "企业微信登录请求已确认，请返回原浏览器继续" };
  }

  const authentication = await authenticateWithWecomCode(code);
  if (!authentication.success) return authentication;
  const returnToken = randomToken();
  const verificationCode = randomVerificationCode();

  const approved = await prisma.wecomLoginHandoff.updateMany({
    where: {
      id: handoff.id,
      approvedAt: null,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    data: {
      userId: authentication.user.id,
      returnTokenHash: sha256(returnToken),
      verificationHash: sha256(verificationCode),
      approvedAt: now,
    },
  });
  if (approved.count !== 1) {
    return { success: false as const, error: "企业微信登录请求已被处理，请返回浏览器重试" };
  }
  return {
    success: true as const,
    handoffId: handoff.id,
    returnToken,
    verificationCode,
  };
}

function parseHandoffCookie(cookieValue: string | null) {
  const separator = cookieValue?.indexOf(".") ?? -1;
  if (!cookieValue || separator <= 0 || separator >= cookieValue.length - 1) return null;
  return {
    id: cookieValue.slice(0, separator),
    browserSecret: cookieValue.slice(separator + 1),
  };
}

export async function consumeWecomLoginHandoff(
  input: ConsumeWecomLoginHandoffInput,
): Promise<ConsumeWecomLoginHandoffResult> {
  const parsed = parseHandoffCookie(input.cookieValue);
  if (!parsed) {
    return {
      status: "error",
      error: "请回到最初发起登录的浏览器继续",
      httpStatus: 401,
      retryable: false,
    };
  }
  const parsedReturnToken = parseHandoffCookie(input.returnToken ?? null);
  if (input.returnToken && (!parsedReturnToken || parsedReturnToken.id !== parsed.id)) {
    return {
      status: "error",
      error: "请回到最初发起登录的浏览器继续",
      httpStatus: 401,
      retryable: false,
    };
  }

  const handoff = await prisma.wecomLoginHandoff.findUnique({
    where: { id: parsed.id },
    select: {
      browserSecretHash: true,
      returnTokenHash: true,
      verificationHash: true,
      failedAttempts: true,
      nextPath: true,
      expiresAt: true,
      approvedAt: true,
      consumedAt: true,
      user: {
        select: {
          id: true,
          wxUserId: true,
          canLogin: true,
          sessionVersion: true,
        },
      },
    },
  });
  if (!handoff || !equalHash(handoff.browserSecretHash, sha256(parsed.browserSecret))) {
    return {
      status: "error",
      error: "请回到最初发起登录的浏览器继续",
      httpStatus: 401,
      retryable: false,
    };
  }

  const now = new Date();
  if (handoff.expiresAt <= now) {
    return {
      status: "error",
      error: "企业微信登录已超时，请重试",
      httpStatus: 410,
      retryable: false,
    };
  }
  if (handoff.consumedAt) {
    return {
      status: "error",
      error: "企业微信登录请求已使用，请重新发起",
      httpStatus: 409,
      retryable: false,
    };
  }
  if (!handoff.approvedAt || !handoff.user) return { status: "pending" };
  if (!handoff.user.canLogin) {
    return {
      status: "error",
      error: "账号已被停用，请联系管理员",
      httpStatus: 403,
      retryable: false,
    };
  }
  if (handoff.failedAttempts >= WECOM_LOGIN_HANDOFF_MAX_ATTEMPTS) {
    return {
      status: "error",
      error: "验证次数过多，请重新发起企业微信登录",
      httpStatus: 429,
      retryable: false,
    };
  }

  const validReturnToken = Boolean(
    parsedReturnToken
      && parsedReturnToken.id === parsed.id
      && handoff.returnTokenHash
      && equalHash(handoff.returnTokenHash, sha256(parsedReturnToken.browserSecret)),
  );
  const verificationCode = input.verificationCode?.trim() ?? "";
  const validVerificationCode = Boolean(
    verificationCode
      && handoff.verificationHash
      && equalHash(handoff.verificationHash, sha256(verificationCode)),
  );

  if (!input.returnToken && !verificationCode) return { status: "awaiting_return" };

  if (!validReturnToken && !validVerificationCode) {
    const nextAttempts = handoff.failedAttempts + 1;
    await prisma.wecomLoginHandoff.updateMany({
      where: {
        id: parsed.id,
        consumedAt: null,
        failedAttempts: { lt: WECOM_LOGIN_HANDOFF_MAX_ATTEMPTS },
      },
      data: { failedAttempts: { increment: 1 } },
    });
    const retryable = nextAttempts < WECOM_LOGIN_HANDOFF_MAX_ATTEMPTS;
    return {
      status: "error",
      error: retryable ? "验证码不正确，请核对后重试" : "验证次数过多，请重新发起企业微信登录",
      httpStatus: retryable ? 401 : 429,
      retryable,
    };
  }

  const token = await createToken({
    userId: handoff.user.id,
    wxUserId: handoff.user.wxUserId ?? "",
    departmentId: 0,
    sessionVersion: handoff.user.sessionVersion,
  });

  const consumed = await prisma.wecomLoginHandoff.updateMany({
    where: {
      id: parsed.id,
      approvedAt: { not: null },
      consumedAt: null,
      expiresAt: { gt: now },
      failedAttempts: { lt: WECOM_LOGIN_HANDOFF_MAX_ATTEMPTS },
    },
    data: { consumedAt: now },
  });
  if (consumed.count !== 1) {
    return {
      status: "error",
      error: "企业微信登录请求已被处理，请重新发起",
      httpStatus: 409,
      retryable: false,
    };
  }
  return { status: "authenticated", token, nextPath: handoff.nextPath };
}
