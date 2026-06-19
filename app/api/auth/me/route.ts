import { NextResponse } from "next/server";
import { getCurrentSessionStatus } from "@workspace/platform/server/account";

export async function GET(request: Request) {
  const session = await getCurrentSessionStatus(request);
  if (session.status === "authenticated") return NextResponse.json({ user: session.user });

  if (session.status === "kicked") {
    const res = NextResponse.json(
      { error: "已在其他设备登录" },
      { status: 401 },
    );
    res.cookies.set("kicked", "1", {
      httpOnly: false,
      secure: false,
      path: "/",
      maxAge: 60,
    });
    return res;
  }

  return NextResponse.json({ error: "未登录" }, { status: 401 });
}
