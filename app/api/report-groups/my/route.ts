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

  // 可填报的：用户是被设为填报成员的
  const memberGroups = await prisma.reportGroup.findMany({
    where: {
      members: {
        some: { userId: payload.userId },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  // 可查看的
  let viewerGroups;
  if (user?.isWorkListAdmin) {
    viewerGroups = await prisma.reportGroup.findMany({
      orderBy: { sortOrder: "asc" },
    });
  } else {
    const anyAdmin = await isAnyGroupAdmin(payload.userId);
    if (anyAdmin) {
      // 周报管理员：自己管理的部门 + 被设为 viewer 的部门
      const adminGroupIds = await prisma.reportGroupAdmin.findMany({
        where: { userId: payload.userId },
        select: { reportGroupId: true },
      });
      const ids = adminGroupIds.map((a) => a.reportGroupId);
      viewerGroups = await prisma.reportGroup.findMany({
        where: {
          OR: [
            { id: { in: ids } },
            { viewers: { some: { userId: payload.userId } } },
          ],
        },
        orderBy: { sortOrder: "asc" },
      });
    } else {
      viewerGroups = await prisma.reportGroup.findMany({
        where: {
          viewers: {
            some: { userId: payload.userId },
          },
        },
        orderBy: { sortOrder: "asc" },
      });
    }
  }

  return NextResponse.json({
    submitGroups: memberGroups,
    viewGroups: viewerGroups,
  });
}
