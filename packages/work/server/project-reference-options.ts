import { NextResponse } from "next/server";
import {
  createReferenceOptionsRoute,
  referenceOptionsQuerySchema,
} from "@workspace/platform/server/reference-options";
import {
  archivedBooleanFilter,
  matchesFkKeyword,
  normalizeLifecycleScope,
} from "@workspace/platform/server/fk-registry";
import { prisma } from "@workspace/platform/server/prisma";
import { buildVisibleProjectWhere } from "./access";
import { buildVisibleMeetingWhere } from "./meeting-access";

const genericReferenceOptions = createReferenceOptionsRoute({
  scope: "work",
  validate: (input) => referenceOptionsQuerySchema.safeParse(input),
});

const PROJECT_FK_KEYS = new Set(["work.projects.parent", "work.projects.member.project", "work.tasks.linked.project"]);
const MEETING_FK_KEYS = new Set(["work.tasks.source.meeting"]);

export async function listWorkReferenceOptions(request: Request, user: { userId: number }) {
  const { searchParams } = new URL(request.url);
  const parsed = referenceOptionsQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "参数错误" }, { status: 400 });
  if (MEETING_FK_KEYS.has(parsed.data.fkKey)) {
    const items = await listVisibleMeetingReferenceOptions({
      userId: user.userId,
      keyword: parsed.data.keyword,
    });
    return NextResponse.json({ items });
  }
  if (!PROJECT_FK_KEYS.has(parsed.data.fkKey)) return genericReferenceOptions(request);

  const items = await listVisibleProjectReferenceOptions({
    userId: user.userId,
    keyword: parsed.data.keyword,
    lifecycleScope: parsed.data.lifecycleScope,
  });
  return NextResponse.json({ items });
}

async function listVisibleMeetingReferenceOptions(input: {
  userId: number;
  keyword: string;
}) {
  const visibleWhere = await buildVisibleMeetingWhere(input.userId);
  const rows = await prisma.meeting.findMany({
    where: visibleWhere,
    select: { id: true, title: true, startAt: true },
    orderBy: [{ startAt: "desc" }, { id: "desc" }],
    take: input.keyword.trim() ? 80 : 20,
  });

  return rows
    .map((row) => ({
      id: row.id,
      name: row.title,
      subtitle: row.startAt ? row.startAt.toISOString().slice(0, 10) : undefined,
      lifecycleStatus: "active" as const,
    }))
    .filter((row) => matchesFkKeyword([row.name, row.subtitle], input.keyword))
    .slice(0, 20);
}

export async function listVisibleProjectReferenceOptions(input: {
  userId: number;
  keyword: string;
  lifecycleScope?: string;
}) {
  const lifecycleScope = normalizeLifecycleScope(input.lifecycleScope);
  const visibleWhere = await buildVisibleProjectWhere(input.userId);
  const rows = await prisma.project.findMany({
    where: { AND: [visibleWhere, archivedBooleanFilter(lifecycleScope)] },
    select: { id: true, name: true, code: true, isArchived: true },
    orderBy: lifecycleScope === "archived" ? [{ archivedAt: "desc" }, { id: "desc" }] : { id: "asc" },
    take: input.keyword.trim() ? 80 : 20,
  });

  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      subtitle: row.code ?? undefined,
      lifecycleStatus: row.isArchived ? "archived" as const : "active" as const,
    }))
    .filter((row) => matchesFkKeyword([row.name, row.subtitle], input.keyword))
    .slice(0, 20);
}
