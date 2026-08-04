import { NextResponse } from "next/server";
import { getCurrentSessionStatus } from "@workspace/platform/server/account";
import { jsonErrorResponse } from "@workspace/platform/server/api";
import { setKickedCookie } from "@workspace/platform/server/auth";

export async function GET(request: Request) {
  const session = await getCurrentSessionStatus(request);
  if (session.status === "authenticated") return NextResponse.json({ user: session.user });

  if (session.status === "kicked") {
    const res = jsonErrorResponse("已在其他设备登录", 401);
    setKickedCookie(res);
    return res;
  }

  return jsonErrorResponse("未登录", 401);
}
