import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate } from "@/lib/auth";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { routineItems: true },
  });

  let routines: Array<{ plan: string; nextGoal?: string }> = [];
  if (user?.routineItems) {
    try {
      routines = JSON.parse(user.routineItems);
    } catch {
      routines = [];
    }
  }

  return NextResponse.json({ routineItems: routines });
}

export async function PUT(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = await request.json();
  const { routineItems } = body as {
    routineItems: Array<{ plan: string; nextGoal?: string }>;
  };

  await prisma.user.update({
    where: { id: payload.userId },
    data: { routineItems: JSON.stringify(routineItems) },
  });

  return NextResponse.json({ success: true });
}
