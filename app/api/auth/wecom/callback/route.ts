import { NextResponse } from "next/server";
import {
  SESSION_MAX_AGE_SECONDS,
  clearWecomLoginCookies,
  readPostLoginNextCookie,
  readWecomStateCookie,
  setSessionCookie,
} from "@workspace/platform/server/auth";
import { loginWithWecomCode } from "@workspace/platform/server/account";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/workspace";
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

function redirectToLogin(request: Request, error: string) {
  const url = new URL(`${getRequestOrigin(request)}${BASE_PATH}/login`);
  url.searchParams.set("wecom_error", error);
  const response = NextResponse.redirect(url);
  clearWecomLoginCookies(response);
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = readWecomStateCookie(request);

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectToLogin(request, "企业微信登录状态已失效，请重试");
  }

  try {
    const login = await loginWithWecomCode(code);
    if (!login.success) return redirectToLogin(request, login.error);

    const nextPath = safeNextPath(readPostLoginNextCookie(request)) || `${BASE_PATH}/portal`;
    const response = NextResponse.redirect(new URL(nextPath, getRequestOrigin(request)));
    setSessionCookie(response, login.token, SESSION_MAX_AGE_SECONDS);
    clearWecomLoginCookies(response);
    return response;
  } catch (error) {
    console.error("WeCom login failed", error);
    return redirectToLogin(request, "企业微信登录失败，请稍后重试");
  }
}
