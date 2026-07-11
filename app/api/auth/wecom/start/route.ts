import { NextResponse } from "next/server";
import { createWecomLoginStart } from "@workspace/platform/server/account";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/workspace";
const POST_LOGIN_NEXT_COOKIE = "post_login_next";

function getRequestOrigin(request: Request) {
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

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const nextPath = safeNextPath(requestUrl.searchParams.get("next"));
    const origin = process.env.WECHAT_REDIRECT_ORIGIN || getRequestOrigin(request);
    const login = createWecomLoginStart(origin, BASE_PATH);

    const response = NextResponse.redirect(login.authorizeUrl);
    response.cookies.set("wecom_oauth_state", login.state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 5,
      path: "/",
    });
    if (nextPath) {
      response.cookies.set(POST_LOGIN_NEXT_COOKIE, nextPath, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 5,
        path: "/",
      });
    }
    return response;
  } catch (error) {
    const loginUrl = new URL(`${BASE_PATH}/login`, request.url);
    loginUrl.searchParams.set("wecom_error", error instanceof Error ? error.message : "配置错误");
    return NextResponse.redirect(loginUrl);
  }
}
