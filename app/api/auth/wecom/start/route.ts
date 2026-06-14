import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { buildWecomWebLoginUrl } from "@/server/auth/wecom";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/workspace";

function getRequestOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) {
    return `${forwardedProto || "https"}://${forwardedHost}`;
  }

  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET(request: Request) {
  try {
    const state = randomBytes(24).toString("hex");
    const origin = process.env.WECHAT_REDIRECT_ORIGIN || getRequestOrigin(request);
    const redirectUri = `${origin}${BASE_PATH}/api/auth/wecom/callback`;
    const authorizeUrl = buildWecomWebLoginUrl(redirectUri, state);

    const response = NextResponse.redirect(authorizeUrl);
    response.cookies.set("wecom_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 5,
      path: "/",
    });
    return response;
  } catch (error) {
    const loginUrl = new URL(`${BASE_PATH}/login`, request.url);
    loginUrl.searchParams.set("wecom_error", error instanceof Error ? error.message : "配置错误");
    return NextResponse.redirect(loginUrl);
  }
}
