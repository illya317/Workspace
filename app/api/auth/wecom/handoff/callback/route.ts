import { NextResponse } from "next/server";
import { z } from "zod";

import { approveWecomLoginHandoff } from "@workspace/platform/server/wecom-login-handoff";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/workspace";
const callbackSchema = z.object({
  code: z.string().min(1).max(1024),
  state: z.string().min(32).max(256),
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

function loginRedirect(
  request: Request,
  params: Record<string, string>,
  fragment?: Record<string, string>,
) {
  const url = new URL(`${requestOrigin(request)}${BASE_PATH}/login`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  if (fragment) url.hash = new URLSearchParams(fragment).toString();
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = callbackSchema.safeParse({
    code: url.searchParams.get("code"),
    state: url.searchParams.get("state"),
  });
  if (!parsed.success) {
    return loginRedirect(request, { wecom_handoff_error: "企业微信登录状态已失效" });
  }

  try {
    const result = await approveWecomLoginHandoff(parsed.data.state, parsed.data.code);
    if (!result.success) return loginRedirect(request, { wecom_handoff_error: result.error });
    return loginRedirect(request, {}, {
      wecom_handoff: "complete",
      handoff_return: `${result.handoffId}.${result.returnToken}`,
      handoff_code: result.verificationCode,
    });
  } catch (error) {
    console.error("Approve WeCom login handoff failed", error);
    return loginRedirect(request, { wecom_handoff_error: "企业微信登录失败" });
  }
}
