import { NextResponse } from "next/server";
import { SESSION_MAX_AGE_SECONDS } from "@workspace/platform/server/auth";
import { loginWithWecomCode } from "@workspace/platform/server/account";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/workspace";
const POST_LOGIN_NEXT_COOKIE = "post_login_next";
const EXPIRED_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  expires: new Date(0),
  path: "/",
};

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

function safeNextPath(value: string | null) {
  const next = value?.trim();
  if (!next || !next.startsWith(`${BASE_PATH}/`) || next.startsWith("//")) return null;
  return next;
}

function clearOauthCookies(response: NextResponse) {
  response.cookies.set("wecom_oauth_state", "", EXPIRED_COOKIE_OPTIONS);
  response.cookies.set(POST_LOGIN_NEXT_COOKIE, "", EXPIRED_COOKIE_OPTIONS);
}

function redirectToLogin(request: Request, error: string) {
  const url = new URL(`${getRequestOrigin(request)}${BASE_PATH}/login`);
  url.searchParams.set("wecom_error", error);
  const response = NextResponse.redirect(url);
  clearOauthCookies(response);
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
    const login = await loginWithWecomCode(code);
    if (!login.success) return redirectToLogin(request, login.error);

    const nextPath = safeNextPath(readCookie(request, POST_LOGIN_NEXT_COOKIE)) || `${BASE_PATH}/portal`;
    const response = NextResponse.redirect(new URL(nextPath, getRequestOrigin(request)));
    response.cookies.set("token", login.token, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: "/",
    });
    clearOauthCookies(response);
    return response;
  } catch (error) {
    console.error("WeCom login failed", error);
    return redirectToLogin(request, "企业微信登录失败，请稍后重试");
  }
}
