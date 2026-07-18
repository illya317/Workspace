import { NextResponse } from "next/server";
import { createWecomLoginStart } from "@workspace/platform/server/account";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/workspace";
const POST_LOGIN_NEXT_COOKIE = "post_login_next";
const WECOM_LOGIN_DISPLAY_PANEL = "panel";

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
  const requestUrl = new URL(request.url);
  const displayPanel = requestUrl.searchParams.get("display") === WECOM_LOGIN_DISPLAY_PANEL;

  try {
    const nextPath = safeNextPath(requestUrl.searchParams.get("next"));
    const origin = process.env.WECHAT_REDIRECT_ORIGIN || getRequestOrigin(request);
    const login = createWecomLoginStart(origin, BASE_PATH);

    const response = displayPanel
      ? NextResponse.json(
        { authorizeUrl: login.authorizeUrl },
        { headers: { "Cache-Control": "no-store" } },
      )
      : NextResponse.redirect(login.authorizeUrl);
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
    const message = error instanceof Error ? error.message : "配置错误";
    if (displayPanel) {
      const response = jsonErrorResponse(message, 503);
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
    const loginUrl = new URL(`${BASE_PATH}/login`, request.url);
    loginUrl.searchParams.set("wecom_error", message);
    return NextResponse.redirect(loginUrl);
  }
}
