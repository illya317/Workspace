import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { createToken, checkPermission } from "@/lib/auth";
import { checkBruteForce, recordAttempt } from "@/lib/security";

export async function POST(request: Request) {
  // 非浏览器拦截
  const origin = request.headers.get("origin") || request.headers.get("referer");
  const csrf = request.headers.get("x-csrf-token");
  if (!origin && !csrf) {
    return NextResponse.json({ error: "仅限浏览器访问" }, { status: 403 });
  }

  const { username, password } = await request.json();
  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";

  // 暴力破解检测
  const brute = await checkBruteForce(username, ip);
  if (brute.blocked) {
    return NextResponse.json(
      { error: `尝试次数过多，请${brute.retryAfter}分钟后再试` },
      { status: 429 }
    );
  }

  if (!username || !password) {
    return NextResponse.json(
      { error: "账号和密码不能为空" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, name: true, username: true, wxUserId: true, password: true, apiKey: true, canLogin: true },
  });

  if (!user || !user.password || !bcrypt.compareSync(password, user.password)) {
    await recordAttempt(username, ip, false);
    const { remaining } = await checkBruteForce(username, ip);
    const hint = remaining && remaining > 0 ? `（剩余${remaining}次尝试）` : "";
    return NextResponse.json(
      { error: `账号或密码错误${hint}` },
      { status: 401 }
    );
  }

  await recordAttempt(username, ip, true);

  const token = await createToken({
    userId: user.id,
    wxUserId: user.wxUserId ?? "",
    name: user.name,
    departmentId: 0,
  });

  const [isAdmin, canAnyWeek, hasHR, hasWorks] = await Promise.all([
    checkPermission(user.id, "system", "admin"),
    checkPermission(user.id, "work.report", "write"),
    checkPermission(user.id, "people", "access"),
    checkPermission(user.id, "work", "access"),
  ]);

  const response = NextResponse.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      departmentId: 0,
      isWorkListAdmin: isAdmin,
      isSuperAdmin: isAdmin,
      canSelectAnyWeek: canAnyWeek,
      canAccessHR: hasHR,
      canAccessWorks: hasWorks,
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
