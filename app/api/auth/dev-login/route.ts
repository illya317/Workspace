import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { createToken } from "@/lib/auth";
import { SESSION_MAX_AGE_SECONDS } from "@/lib/auth/token";
import { checkBruteForce, recordAttempt } from "@/lib/security";
import { LoginSchema, parseJson } from "@/lib/schemas";
import {
  ensureGrantCache,
  getManageableResourceKeys,
  getPermissionContext,
  getVisibleResourceKeys,
} from "@workspace/platform/server/auth";

export async function POST(request: Request) {
  // 非浏览器拦截
  const origin = request.headers.get("origin") || request.headers.get("referer");
  const csrf = request.headers.get("x-csrf-token");
  if (!origin && !csrf) {
    return NextResponse.json({ error: "仅限浏览器访问" }, { status: 403 });
  }

  const parsed = await parseJson(request, LoginSchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { username, password } = parsed.data;
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
    select: { id: true, name: true, username: true, wxUserId: true, password: true, apiKey: true, canLogin: true, sessionVersion: true },
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

  if (!user.canLogin) {
    await recordAttempt(username, ip, false);
    return NextResponse.json(
      { error: "账号已被停用，请联系管理员" },
      { status: 403 }
    );
  }

  await recordAttempt(username, ip, true);

  const token = await createToken({
    userId: user.id,
    wxUserId: user.wxUserId ?? "",
    name: user.name,
    departmentId: 0,
    sessionVersion: user.sessionVersion,
  });

  const ctx = await getPermissionContext(user.id);
  await ensureGrantCache(ctx);
  const [visibleAccess, visibleWrite] = await Promise.all([
    getVisibleResourceKeys(ctx, "access"),
    getVisibleResourceKeys(ctx, "write"),
  ]);
  const isAdmin = ctx.isAdmin;

  const canAnyWeek = visibleWrite.has("work.report");
  const manageableKeys = await getManageableResourceKeys(user.id);

  const response = NextResponse.json({
    success: true,
    user: {
      id: user.id, name: user.name, departmentId: 0, isWorkListAdmin: isAdmin, isSuperAdmin: isAdmin,
      canSelectAnyWeek: canAnyWeek,
      visibleResourceKeys: [...visibleAccess],
      visibleWriteResourceKeys: [...visibleWrite],
      manageableResourceKeys: [...manageableKeys],
    },
  });
  response.cookies.set("token", token, { httpOnly: true, secure: false, sameSite: "lax", maxAge: SESSION_MAX_AGE_SECONDS, path: "/" });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set("token", "", { httpOnly: true, secure: false, sameSite: "lax", expires: new Date(0), path: "/" });
  return response;
}
