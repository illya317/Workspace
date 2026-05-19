import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const positions = await prisma.departmentPosition.findMany({
    include: {
      department: { select: { name: true } },
      position: { select: { name: true, code: true } },
    },
    orderBy: [{ managementGroup: "asc" }, { department: { name: "asc" } }, { position: { code: "asc" } }],
  });
  return NextResponse.json({ positions });
}
