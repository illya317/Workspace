import { NextResponse } from "next/server";
import { createToken } from "@/lib/auth/token";

export async function GET() {
  const token = await createToken({
    userId: 2,
    wxUserId: "",
    name: "admin",
    departmentId: 0,
    sessionVersion: 2,
  });

  const response = NextResponse.json({ success: true, message: "已登录为 admin" });
  response.cookies.set("token", token, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return response;
}
