import { NextResponse } from "next/server";
import { withLibraryAccess } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";

export const GET = withLibraryAccess(async () => {
  const sources = await prisma.libraryGeneratedSource.findMany({
    where: { enabled: true },
    orderBy: { name: "asc" },
    select: {
      key: true,
      name: true,
      outputCategory: true,
      defaultConfidentialityLevel: true,
      enabled: true,
    },
  });
  return NextResponse.json(sources);
});
