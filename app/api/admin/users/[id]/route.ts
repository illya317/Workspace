import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { authenticate, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const isSelf = payload.userId === parseInt(id);

  if (!isSelf && !(await isAdmin(request))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await request.json();

  // Single field update
  if (body.field && body.value !== undefined) {
    const { field, value } = body;
    const SELF_ALLOWED = ["username"];
    const ADMIN_ALLOWED = ["canLogin", "name", "username", "employeeId"];
    const allowed = isSelf ? SELF_ALLOWED : ADMIN_ALLOWED;
    if (!allowed.includes(field)) return NextResponse.json({ error: "非法字段" }, { status: 400 });
    await prisma.user.update({
      where: { id: parseInt(id) },
      data: { [field]: field === "canLogin" ? !!value : value || null },
    });
    return NextResponse.json({ success: true });
  }

  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { resourceKey, roleKey, value } = body;

  if (resourceKey && roleKey && typeof value === "boolean") {
    const resource = await prisma.resource.findUnique({ where: { key: resourceKey } });
    const role = await prisma.role.findUnique({ where: { key: roleKey } });
    if (resource && role) {
      if (value) {
        await prisma.userResourceRole.create({
          data: { userId: parseInt(id), resourceId: resource.id, roleId: role.id, scopeId: null },
        });
      } else {
        await prisma.userResourceRole.deleteMany({
          where: { userId: parseInt(id), resourceId: resource.id, roleId: role.id, scopeId: null },
        });
      }
    }
  }

  return NextResponse.json({ success: true });
}

function randomPassword(length = 8): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const newPassword = randomPassword(10);

  await prisma.user.update({
    where: { id: parseInt(id) },
    data: {
      password: bcrypt.hashSync(newPassword, 10),
      sessionVersion: { increment: 1 },
    },
  });

  return NextResponse.json({ success: true, password: newPassword });
}
