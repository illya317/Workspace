import { NextResponse } from "next/server";
import { z } from "zod";

import { jsonErrorResponse, parseJson } from "@workspace/platform/server/api";
import {
  createWecomLoginHandoff,
  WECOM_LOGIN_HANDOFF_COOKIE,
  WECOM_LOGIN_HANDOFF_TTL_SECONDS,
} from "@workspace/platform/server/wecom-login-handoff";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/workspace";
const startSchema = z.object({ next: z.string().max(2048).nullish() });

function requestOrigin(request: Request) {
  if (process.env.WECHAT_REDIRECT_ORIGIN) {
    return new URL(process.env.WECHAT_REDIRECT_ORIGIN).origin;
  }
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) return new URL(`${forwardedProto || "https"}://${forwardedHost}`).origin;
  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  const origin = requestOrigin(request);
  if (request.headers.get("origin") !== origin) {
    return jsonErrorResponse("仅限当前浏览器发起企业微信登录", 403);
  }

  const parsed = await parseJson(request, startSchema);
  if (!parsed.ok) return jsonErrorResponse(parsed.error, 400);

  try {
    const handoff = await createWecomLoginHandoff({
      origin,
      basePath: BASE_PATH,
      nextPath: parsed.data.next,
    });
    const response = NextResponse.json({
      launchUrl: handoff.launchUrl,
      expiresAt: handoff.expiresAt.toISOString(),
    });
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(WECOM_LOGIN_HANDOFF_COOKIE, handoff.cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: WECOM_LOGIN_HANDOFF_TTL_SECONDS,
      path: "/",
    });
    return response;
  } catch (error) {
    console.error("Create WeCom login handoff failed", error);
    return jsonErrorResponse("企业微信登录初始化失败，请稍后重试", 503);
  }
}
