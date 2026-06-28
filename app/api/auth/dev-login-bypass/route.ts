import { NextResponse } from "next/server";
import { z } from "zod";
import { SESSION_MAX_AGE_SECONDS } from "@workspace/platform/server/auth";
import { loginWithDevUserId } from "@workspace/platform/server/account";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const devLoginQuerySchema = z.object({
  userId: z.coerce.number().int().positive().default(2),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = devLoginQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return jsonErrorResponse("参数无效", 400);

  const login = await loginWithDevUserId(parsed.data.userId);
  if (!login.success) return jsonErrorResponse(login.error, login.status);

  const response = NextResponse.json({ success: true, message: login.message });
  response.cookies.set("token", login.token, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
  return response;
}
