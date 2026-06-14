import { NextResponse } from "next/server";
import { createToken } from "@/lib/auth/token";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = parseInt(searchParams.get("userId") || "2");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, sessionVersion: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const token = await createToken({
    userId: user.id,
    wxUserId: "",
    name: user.name,
    departmentId: 0,
    sessionVersion: user.sessionVersion,
    authProvider: "password",
  });

  const response = NextResponse.json({ success: true, message: `已登录为 ${user.name}` });
  response.cookies.set("token", token, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return response;
}
