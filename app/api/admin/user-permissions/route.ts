import { NextResponse } from "next/server";
import { authenticate, checkPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Map old User boolean fields to new Resource+Role pairs
const FIELD_TO_RESOURCE_ROLE: Record<string, { resource: string; role: string }> = {
  isWorkListAdmin: { resource: "system", role: "access" },
  canSelectAnyWeek: { resource: "system", role: "access" },
  canAccessHR: { resource: "module.hr", role: "access" },
  canAccessWorks: { resource: "module.works", role: "access" },
  canLogin: { resource: "system", role: "access" },
};

// Reverse map for new-style permissionKey -> old field name
const RESOURCE_ROLE_TO_FIELD: Record<string, string> = {
  "system.access": "isWorkListAdmin",
  "module.hr.access": "canAccessHR",
  "module.works.access": "canAccessWorks",
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

  // Check super admin: old isWorkListAdmin OR new system.admin
  const admin = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { isWorkListAdmin: true },
  });
  if (!admin?.isWorkListAdmin && !(await checkPermission(payload.userId, "system.admin"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await request.json();
  const { userId, field, permissionKey, value, resourceKey, roleKey } = body;

  if (!userId || typeof value !== "boolean") {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }

  // Determine the old field name and new resource+role
  let oldField: string | null = null;
  let newResourceKey: string | null = null;
  let newRoleKey: string | null = null;

  // Support new-style: { userId, resourceKey: "system", roleKey: "access", value: true }
  if (resourceKey && roleKey && typeof resourceKey === "string" && typeof roleKey === "string") {
    newResourceKey = resourceKey;
    newRoleKey = roleKey;
    oldField = RESOURCE_ROLE_TO_FIELD[`${resourceKey}.${roleKey}`] || null;
  }

  // Support new-style: { userId, permissionKey: "system.admin", value: true } (old compat)
  if (!newResourceKey && permissionKey && typeof permissionKey === "string") {
    const mapping = FIELD_TO_RESOURCE_ROLE[permissionKey];
    if (mapping) {
      // permissionKey is actually a field name like "isWorkListAdmin"
      newResourceKey = mapping.resource;
      newRoleKey = mapping.role;
      oldField = permissionKey;
    } else {
      // Try parsing as "resourceKey.roleKey"
      const parts = permissionKey.split(".");
      if (parts.length >= 2) {
        // Could be "system.access" or "module.hr.access"
        const knownRoles = ["access", "admin", "write", "read", "member", "viewer"];
        for (const role of knownRoles) {
          if (permissionKey.endsWith(`.${role}`)) {
            newResourceKey = permissionKey.slice(0, -(role.length + 1));
            newRoleKey = role;
            break;
          }
        }
      }
    }
  }

  // Support old-style: { userId, field: "isWorkListAdmin", value: true }
  if (field && typeof field === "string") {
    if (!allowedFields.includes(field)) {
      return NextResponse.json({ error: "无效的权限字段" }, { status: 400 });
    }
    oldField = field;
    if (!newResourceKey) {
      const mapping = FIELD_TO_RESOURCE_ROLE[field];
      if (mapping) {
        newResourceKey = mapping.resource;
        newRoleKey = mapping.role;
      }
    }
  }

  if (!oldField && !newResourceKey) {
    return NextResponse.json(
      { error: "缺少 field、resourceKey 或 permissionKey 参数" },
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

  // 2. Create or delete UserResourceRole record
  if (newResourceKey && newRoleKey) {
    const resource = await prisma.resource.findUnique({
      where: { key: newResourceKey },
    });
    const role = await prisma.role.findUnique({
      where: { key: newRoleKey },
    });

    if (resource && role) {
      if (value) {
        // Grant: create UserResourceRole with scopeId=null (global toggle) if not exists
        const existing = await prisma.userResourceRole.findFirst({
          where: {
            userId,
            resourceId: resource.id,
            roleId: role.id,
            scopeId: null,
          },
        });
        if (!existing) {
          await prisma.userResourceRole.create({
            data: {
              userId,
              resourceId: resource.id,
              roleId: role.id,
              scopeId: null,
            },
          });
        }
      } else {
        // Revoke: delete UserResourceRole if exists
        await prisma.userResourceRole.deleteMany({
          where: {
            userId,
            resourceId: resource.id,
            roleId: role.id,
            scopeId: null,
          },
        });
      }
    }
  }

  return NextResponse.json({ success: true });
}
