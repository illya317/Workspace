import { NextResponse } from "next/server";
import { getTokenFromCookie, verifyToken } from "@workspace/platform/server/auth";
import { isUserSessionActive } from "@workspace/platform/server/account";

export async function GET(request: Request) {
  const token = getTokenFromCookie(request);
  if (!token) {
    return new NextResponse(null, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return new NextResponse(null, { status: 401 });
  }

  if (!(await isUserSessionActive(payload.userId, payload.sessionVersion))) {
    return new NextResponse(null, { status: 401 });
  }

  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
