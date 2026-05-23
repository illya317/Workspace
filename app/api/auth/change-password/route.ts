import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { authenticate } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = await authenticate(request);
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { oldPassword, newPassword } = await request.json();

  if (!oldPassword || !newPassword) {
    return NextResponse.json(
      { error: "旧密码和新密码不能为空" },
      { status: 400 }
    );
  }

  if (newPassword.length < 4) {
    return NextResponse.json(
      { error: "新密码至少4位" },
      { status: 400 }
    );
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.userId },
  });

  if (!dbUser || !dbUser.password || !bcrypt.compareSync(oldPassword, dbUser.password)) {
    return NextResponse.json(
      { error: "旧密码错误" },
      { status: 401 }
    );
  }

  await prisma.user.update({
    where: { id: user.userId },
    data: { password: bcrypt.hashSync(newPassword, 10) },
  });

  return NextResponse.json({ success: true });
}
