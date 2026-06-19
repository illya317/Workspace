import { NextResponse } from "next/server";
import { z } from "zod";
import { SESSION_MAX_AGE_SECONDS } from "@workspace/platform/server/auth";
import { parseJson } from "@workspace/platform/server/api";
import { loginWithPassword } from "@workspace/platform/server/account";

const loginSchema = z.object({
  username: z.string().min(1, "账号不能为空"),
  password: z.string().min(1, "密码不能为空"),
});

export async function POST(request: Request) {
  const origin = request.headers.get("origin") || request.headers.get("referer");
  const csrf = request.headers.get("x-csrf-token");
  if (!origin && !csrf) {
    return NextResponse.json({ error: "仅限浏览器访问" }, { status: 403 });
  }

  const parsed = await parseJson(request, loginSchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
  const result = await loginWithPassword(parsed.data.username, parsed.data.password, ip);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const response = NextResponse.json({
    success: true,
    user: result.user,
  });
  response.cookies.set("token", result.token, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set("token", "", {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    expires: new Date(0),
    path: "/",
  });
  return response;
}
