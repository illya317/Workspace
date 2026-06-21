import { NextResponse } from "next/server";
import {
  createReferenceOptionsRoute,
  referenceOptionsQuerySchema,
} from "@workspace/platform/server/reference-options";
import { withWorkAccess } from "@workspace/platform/server/with-auth";
import { listVisibleProjectReferenceOptions } from "@workspace/work/server";

const genericReferenceOptions = createReferenceOptionsRoute({
  scope: "work",
  validate: (input) => referenceOptionsQuerySchema.safeParse(input),
});

const PROJECT_FK_KEYS = new Set(["work.project.parent", "work.project.member.project"]);

export const GET = withWorkAccess(async (request, user) => {
  const { searchParams } = new URL(request.url);
  const parsed = referenceOptionsQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "参数错误" }, { status: 400 });
  if (!PROJECT_FK_KEYS.has(parsed.data.fkKey)) return genericReferenceOptions(request, user);

  const items = await listVisibleProjectReferenceOptions({
    userId: user.userId,
    keyword: parsed.data.keyword,
    lifecycleScope: parsed.data.lifecycleScope,
  });
  return NextResponse.json({ items });
});
