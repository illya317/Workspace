import { NextResponse } from "next/server";
import { authenticate, checkPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Map old User boolean fields to new Permission keys
const FIELD_TO_PERM_KEY: Record<string, string> = {
  isWorkListAdmin: "system.admin",
  canSelectAnyWeek: "system.any_week",
  canAccessHR: "module.hr",
  canAccessWorks: "module.works",
  canLogin: "system.login",
};

// Reverse map for looking up permission key from old field name
const PERM_KEY_TO_FIELD: Record<string, string> = {
  "system.admin": "isWorkListAdmin",
  "system.any_week": "canSelectAnyWeek",
  "module.hr": "canAccessHR",
  "module.works": "canAccessWorks",
  "system.login": "canLogin",
};

const allowedFields = [
  "isWorkListAdmin",
  "canSelectAnyWeek",
  "canAccessHR",
  "canAccessWorks",
  "canLogin",
];

export async function PUT(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  // Check super admin: old isWorkListAdmin OR new UserPermission system.admin
  const admin = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { isWorkListAdmin: true },
  });
  if (!admin?.isWorkListAdmin && !(await checkPermission(payload.userId, "system.admin"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await request.json();
  const { userId, field, permissionKey, value } = body;

  if (!userId || typeof value !== "boolean") {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }

  // Determine the old field name and new permission key
  let oldField: string | null = null;
  let newPermKey: string | null = null;

  // Support new-style: { userId, permissionKey: "system.admin", value: true }
  if (permissionKey && typeof permissionKey === "string") {
    newPermKey = permissionKey;
    oldField = PERM_KEY_TO_FIELD[permissionKey] || null;
  }

  // Support old-style: { userId, field: "isWorkListAdmin", value: true }
  if (field && typeof field === "string") {
    if (!allowedFields.includes(field)) {
      return NextResponse.json({ error: "无效的权限字段" }, { status: 400 });
    }
    oldField = field;
    newPermKey = newPermKey || FIELD_TO_PERM_KEY[field] || null;
  }

  if (!oldField && !newPermKey) {
    return NextResponse.json(
      { error: "缺少 field 或 permissionKey 参数" },
      { status: 400 }
    );
  }

  // 1. Update old User boolean for backward compat
  if (oldField) {
    await prisma.user.update({
      where: { id: userId },
      data: { [oldField]: value },
    });
  }

  // 2. Create or delete UserPermission record
  if (newPermKey) {
    const perm = await prisma.permission.findUnique({
      where: { key: newPermKey },
    });

    if (perm) {
      if (value) {
        // Grant: upsert UserPermission
        await prisma.userPermission.upsert({
          where: {
            userId_permissionId: { userId, permissionId: perm.id },
          },
          create: {
            userId,
            permissionId: perm.id,
          },
          update: {},
        });
      } else {
        // Revoke: delete UserPermission if exists
        await prisma.userPermission.deleteMany({
          where: { userId, permissionId: perm.id },
        });
      }
    }
    // If perm not found, the Permission table might not be seeded yet — skip silently
  }

  return NextResponse.json({ success: true });
}
