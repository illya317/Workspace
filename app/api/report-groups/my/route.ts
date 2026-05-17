import { NextResponse } from "next/server";
import { authenticate, isAnyGroupAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { isWorkListAdmin: true },
  });

  // 获取用户在该资源上的所有角色（UserResourceRole, resource=report_group）
  const roles = await prisma.userResourceRole.findMany({
    where: {
      userId: payload.userId,
      resource: { key: "report_group" },
    },
    select: { scopeId: true, role: { select: { key: true } } },
  });

  const memberGroupIds = roles
    .filter((r) => r.role.key === "member")
    .map((r) => parseInt(r.scopeId!))
    .filter((n) => !isNaN(n) && n > 0);
  const adminGroupIds = roles
    .filter((r) => r.role.key === "admin")
    .map((r) => parseInt(r.scopeId!))
    .filter((n) => !isNaN(n) && n > 0);
  const viewerGroupIds = roles
    .filter((r) => r.role.key === "viewer")
    .map((r) => parseInt(r.scopeId!))
    .filter((n) => !isNaN(n) && n > 0);

  // 可填报的：用户被设为填报成员
  const memberGroups = memberGroupIds.length > 0
    ? await prisma.reportGroup.findMany({
        where: { id: { in: memberGroupIds } },
        orderBy: { sortOrder: "asc" },
      })
    : [];

  // 可查看的
  let viewerGroups;
  if (user?.isWorkListAdmin) {
    viewerGroups = await prisma.reportGroup.findMany({
      orderBy: { sortOrder: "asc" },
    });
  } else if (adminGroupIds.length > 0) {
    // 周报管理员：自己管理的部门 + 被设为 viewer 的部门
    const viewIds = [...new Set([...adminGroupIds, ...viewerGroupIds])];
    viewerGroups = viewIds.length > 0
      ? await prisma.reportGroup.findMany({
          where: { id: { in: viewIds } },
          orderBy: { sortOrder: "asc" },
        })
      : [];
  } else {
    viewerGroups = viewerGroupIds.length > 0
      ? await prisma.reportGroup.findMany({
          where: { id: { in: viewerGroupIds } },
          orderBy: { sortOrder: "asc" },
        })
      : [];
  }

  return NextResponse.json({
    isAdmin: user?.isWorkListAdmin === true,
    submitGroups: memberGroups,
    viewGroups: viewerGroups,
  });
}
