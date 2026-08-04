import { NextResponse } from "next/server";
import { createWecomLoginStart } from "@workspace/platform/server/account";
import { jsonErrorResponse } from "@workspace/platform/server/api";
import { setWecomLoginCookies } from "@workspace/platform/server/auth";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/workspace";
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
  const inApp = !displayPanel && /wxwork/i.test(request.headers.get("user-agent") || "");

  try {
    const nextPath = safeNextPath(requestUrl.searchParams.get("next"));
    const origin = process.env.WECHAT_REDIRECT_ORIGIN || getRequestOrigin(request);
    const login = createWecomLoginStart(origin, BASE_PATH, inApp ? "in-app" : "web");

    const response = displayPanel
      ? NextResponse.json(
        { authorizeUrl: login.authorizeUrl },
        { headers: { "Cache-Control": "no-store" } },
      )
      : NextResponse.redirect(login.authorizeUrl);
    setWecomLoginCookies(response, login.state, nextPath);
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
