import { NextResponse } from "next/server";
import { searchEdpReportToOptions } from "@workspace/hr/server";
import {
  createReferenceOptionsRoute,
  referenceOptionsQuerySchema,
} from "@workspace/platform/server/reference-options";
import { withHRAccess } from "@workspace/platform/server/with-auth";

const genericReferenceOptionsRoute = createReferenceOptionsRoute({
  scope: "hr",
  validate: (input) => referenceOptionsQuerySchema.safeParse(input),
});

export const GET = withHRAccess(async (request, user) => {
  const { searchParams } = new URL(request.url);
  const parsed = referenceOptionsQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "参数错误" }, { status: 400 });

  if (parsed.data.fkKey !== "hr.edp.reportTo") {
    return genericReferenceOptionsRoute(request, user);
  }

  const rawPositionId = searchParams.get("positionId");
  const positionId = rawPositionId ? Number(rawPositionId) : null;
  if (positionId !== null && (!Number.isInteger(positionId) || positionId <= 0)) {
    return NextResponse.json({ error: "岗位ID无效" }, { status: 400 });
  }

  const items = await searchEdpReportToOptions({
    keyword: parsed.data.keyword,
    positionId,
  });
  return NextResponse.json({ items });
});
