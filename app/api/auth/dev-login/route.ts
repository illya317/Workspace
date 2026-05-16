import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createToken } from "@/lib/auth";

export async function POST(request: Request) {
  const { username, password } = await request.json();

  if (!username || !password) {
    return NextResponse.json(
      { error: "账号和密码不能为空" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { username },
  });

  if (!user || user.password !== password) {
    return NextResponse.json(
      { error: "账号或密码错误" },
      { status: 401 }
    );
  }

  const token = await createToken({
    userId: user.id,
    wxUserId: user.wxUserId,
    name: user.name,
    departmentId: user.departmentId,
    departmentName: user.departmentName,
  });

  const response = NextResponse.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      departmentId: user.departmentId,
      departmentName: user.departmentName,
      isWorkListAdmin: user.isWorkListAdmin,
      canSelectAnyWeek: user.canSelectAnyWeek,
      canAccessHR: user.canAccessHR,
    },
  });

  response.cookies.set("token", token, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
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
