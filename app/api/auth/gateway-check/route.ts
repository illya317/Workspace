import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTokenFromCookie, verifyToken } from "@/lib/auth";

export async function GET(request: Request) {
  const token = getTokenFromCookie(request);
  if (!token) {
    return new NextResponse(null, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return new NextResponse(null, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { canLogin: true, sessionVersion: true },
  });

  if (!user?.canLogin || user.sessionVersion !== payload.sessionVersion) {
    return new NextResponse(null, { status: 401 });
  }

  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
