import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createToken } from "@/lib/auth";
import { getWecomUserByCode, getWecomUserDetail } from "@/server/auth/wecom";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/workspace";

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  const match = cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function getRequestOrigin(request: Request) {
  if (process.env.WECHAT_REDIRECT_ORIGIN) {
    return process.env.WECHAT_REDIRECT_ORIGIN;
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) {
    return `${forwardedProto || "https"}://${forwardedHost}`;
  }

  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function redirectToLogin(request: Request, error: string) {
  const url = new URL(`${getRequestOrigin(request)}${BASE_PATH}/login`);
  url.searchParams.set("wecom_error", error);
  const response = NextResponse.redirect(url);
  response.cookies.set("wecom_oauth_state", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: new Date(0),
    path: "/",
  });
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = readCookie(request, "wecom_oauth_state");

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectToLogin(request, "企业微信登录状态已失效，请重试");
  }

  try {
    const { userId: wxUserId, userTicket } = await getWecomUserByCode(code);
    const user = await prisma.user.findUnique({
      where: { wxUserId },
      select: { id: true, name: true, wxUserId: true, canLogin: true },
    });

    if (!user) {
      return redirectToLogin(request, `企业微信账号 ${wxUserId} 尚未绑定`);
    }
    if (!user.canLogin) {
      return redirectToLogin(request, "账号已被停用，请联系管理员");
    }

    let avatar: string | undefined;
    if (userTicket) {
      try {
        const detail = await getWecomUserDetail(userTicket);
        avatar = detail?.avatar || undefined;
      } catch (error) {
        console.error("Sync WeCom user detail failed", error);
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        sessionVersion: { increment: 1 },
        ...(avatar ? { avatar } : {}),
      },
      select: { sessionVersion: true },
    });

    const token = await createToken({
      userId: user.id,
      wxUserId: user.wxUserId ?? "",
      name: user.name,
      departmentId: 0,
      sessionVersion: updatedUser.sessionVersion,
    });

    const response = NextResponse.redirect(new URL(`${getRequestOrigin(request)}${BASE_PATH}/portal`));
    response.cookies.set("token", token, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    response.cookies.set("wecom_oauth_state", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: new Date(0),
      path: "/",
    });
    return response;
  } catch (error) {
    console.error("WeCom login failed", error);
    return redirectToLogin(request, "企业微信登录失败，请稍后重试");
  }
}
