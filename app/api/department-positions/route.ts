import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const positions = await prisma.position.findMany({
    include: {
      department: { select: { name: true } },
    },
    orderBy: [{ code: "asc" }, { department: { name: "asc" } }],
  });
  return NextResponse.json({ positions });
}
