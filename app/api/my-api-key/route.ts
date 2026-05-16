import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

function generateApiKey(): string {
  return randomBytes(24).toString("hex");
}

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { apiKey: true },
  });

  return NextResponse.json({ apiKey: user?.apiKey || null });
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const newKey = generateApiKey();

  await prisma.user.update({
    where: { id: payload.userId },
    data: { apiKey: newKey },
  });

  return NextResponse.json({ apiKey: newKey });
}
