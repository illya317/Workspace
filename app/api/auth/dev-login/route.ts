import { NextResponse } from "next/server";
import { z } from "zod";
import {
  SESSION_MAX_AGE_SECONDS,
  clearSessionCookies,
  setSessionCookie,
} from "@workspace/platform/server/auth";
import { jsonErrorResponse, parseJson } from "@workspace/platform/server/api";
import { loginWithApiKey } from "@workspace/platform/server/account";

const loginSchema = z.object({
  username: z.string().min(1, "账号不能为空"),
  password: z.string().min(1, "密码不能为空"),
});

export async function POST(request: Request) {
  const origin = request.headers.get("origin") || request.headers.get("referer");
  const csrf = request.headers.get("x-csrf-token");
  if (!origin && !csrf) {
    return jsonErrorResponse("仅限浏览器访问", 403);
  }

  const parsed = await parseJson(request, loginSchema);
  if (!parsed.ok) {
    return jsonErrorResponse(parsed.error, 400);
  }

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
  const result = await loginWithApiKey(parsed.data.username, parsed.data.password, ip);
  if (!result.success) {
    return jsonErrorResponse(result.error, result.status);
  }

  const response = NextResponse.json({
    success: true,
  });
  setSessionCookie(response, result.token, SESSION_MAX_AGE_SECONDS);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  clearSessionCookies(response);
  return response;
}
