import { NextResponse } from "next/server";
import { authenticate, checkPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clearBypassCache } from "@workspace/platform/server/auth";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const isSuperAdmin = await checkPermission(payload.userId, "system", "admin");
  if (!isSuperAdmin) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const [cs, bypass] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { key: "conflictStrategy" } }),
    prisma.systemConfig.findUnique({ where: { key: "systemAdminBusinessBypass" } }),
  ]);

  return NextResponse.json({
    conflictStrategy: cs?.value || "union",
    systemAdminBusinessBypass: bypass?.value !== "false",
  });
}

export async function PUT(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const isSuperAdmin = await checkPermission(payload.userId, "system", "admin");
  if (!isSuperAdmin) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const body = await request.json();

  if (body.conflictStrategy) {
    if (!["union", "deny_override"].includes(body.conflictStrategy)) {
      return NextResponse.json({ error: "conflictStrategy 需要是 union 或 deny_override" }, { status: 400 });
    }
    await prisma.systemConfig.upsert({
      where: { key: "conflictStrategy" },
      update: { value: body.conflictStrategy },
      create: { key: "conflictStrategy", value: body.conflictStrategy },
    });
  }

  if (typeof body.systemAdminBusinessBypass === "boolean") {
    await prisma.systemConfig.upsert({
      where: { key: "systemAdminBusinessBypass" },
      update: { value: body.systemAdminBusinessBypass ? "true" : "false" },
      create: { key: "systemAdminBusinessBypass", value: body.systemAdminBusinessBypass ? "true" : "false" },
    });
    clearBypassCache();
  }

  return NextResponse.json({ success: true });
}
