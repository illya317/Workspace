import { NextResponse } from "next/server";
import { z } from "zod";

import { SESSION_MAX_AGE_SECONDS } from "@workspace/platform/server/auth";
import { jsonErrorResponse, parseJson } from "@workspace/platform/server/api";
import {
  consumeWecomLoginHandoff,
  WECOM_LOGIN_HANDOFF_COOKIE,
} from "@workspace/platform/server/wecom-login-handoff";

const EXPIRED_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  expires: new Date(0),
  path: "/",
};
const consumeSchema = z.object({
  returnToken: z.string().min(32).max(256).optional(),
  verificationCode: z.string().regex(/^\d{8}$/).optional(),
});

function requestOrigin(request: Request) {
  if (process.env.WECHAT_REDIRECT_ORIGIN) {
    return new URL(process.env.WECHAT_REDIRECT_ORIGIN).origin;
  }
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) return new URL(`${forwardedProto || "https"}://${forwardedHost}`).origin;
  return new URL(request.url).origin;
}

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  const match = cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== requestOrigin(request)) {
    return jsonErrorResponse("仅限当前浏览器领取企业微信登录", 403);
  }

  const parsed = await parseJson(request, consumeSchema);
  if (!parsed.ok) return jsonErrorResponse(parsed.error, 400);

  try {
    const result = await consumeWecomLoginHandoff({
      cookieValue: readCookie(request, WECOM_LOGIN_HANDOFF_COOKIE),
      returnToken: parsed.data.returnToken,
      verificationCode: parsed.data.verificationCode,
    });
    if (result.status === "pending" || result.status === "awaiting_return") {
      return NextResponse.json(
        { status: result.status },
        { status: 202, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (result.status === "error") {
      const response = jsonErrorResponse(result.error, result.httpStatus);
      response.headers.set("Cache-Control", "no-store");
      if (!result.retryable) {
        response.cookies.set(WECOM_LOGIN_HANDOFF_COOKIE, "", EXPIRED_COOKIE_OPTIONS);
      }
      return response;
    }

    const response = NextResponse.json({
      status: "authenticated",
      nextPath: result.nextPath,
    });
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set("token", result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: "/",
    });
    response.cookies.set(WECOM_LOGIN_HANDOFF_COOKIE, "", EXPIRED_COOKIE_OPTIONS);
    return response;
  } catch (error) {
    console.error("Consume WeCom login handoff failed", error);
    const response = jsonErrorResponse("企业微信登录领取失败，请稍后重试", 503);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
