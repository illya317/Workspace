import { matchesFkKeyword, type FkOption } from "@workspace/platform/server/fk-registry";
import { Prisma, prisma } from "@workspace/platform/server/prisma";

const assignedAlignmentItemSelect = {
  id: true,
  content: true,
  itemType: true,
  targetType: true,
  targetId: true,
  krTargetValue: true,
  krUnit: true,
  plan: { select: { title: true, okrCycle: { select: { label: true, startDate: true } } } },
} satisfies Prisma.WorkItemSelect;

export async function listAssignedWorkItemAlignmentOptions(input: {
  userId?: number | null;
  keyword: string;
  targetType?: string | null;
  targetId?: number | null;
  currentWorkItemId?: number | null;
}) {
  const targetId = normalizePositive(input.targetId);
  if (input.targetType !== "personal" || !targetId || input.userId !== targetId) return [];
  const employeeIds = await employeeIdsForUser(targetId);
  if (employeeIds.length === 0) return [];
  const rows = await prisma.workItem.findMany({
    where: unalignedAssignedWorkItemWhere({
      employeeIds,
      personalTargetId: targetId,
      currentWorkItemId: normalizePositive(input.currentWorkItemId),
    }),
    select: assignedAlignmentItemSelect,
    orderBy: [{ plan: { okrCycle: { startDate: "asc" } } }, { targetType: "asc" }, { targetId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
    take: input.keyword.trim() ? 120 : 50,
  });
  return rows
    .map(assignedWorkItemRowToOption)
    .filter((option) => matchesFkKeyword([option.name, option.subtitle], input.keyword))
    .slice(0, 20);
}

export async function validateAssignedTaskAlignmentSource(input: {
  actorUserId?: number | null;
  currentWorkId?: number | null;
  targetType: string;
  targetId: number;
  category?: string | null;
  parentPeriodWorkItemId?: number | null;
  previousPeriodWorkItemId?: number | null;
}) {
  if (input.previousPeriodWorkItemId) return "任务不能选择前置节点";
  if (!input.parentPeriodWorkItemId) return null;
  return await isAssignedWorkItemAlignmentSource(input) ? null : "对齐内容必须来自未完成且未对齐的承接/协作事项";
}

export async function isAssignedWorkItemAlignmentSource(input: {
  actorUserId?: number | null;
  currentWorkId?: number | null;
  targetType: string;
  targetId: number;
  parentPeriodWorkItemId?: number | null;
}) {
  if (!input.parentPeriodWorkItemId || input.targetType !== "personal" || input.actorUserId !== input.targetId) return false;
  const employeeIds = await employeeIdsForUser(input.targetId);
  if (employeeIds.length === 0) return false;
  const source = await prisma.workItem.findFirst({
    where: { id: input.parentPeriodWorkItemId, ...unalignedAssignedWorkItemWhere({ employeeIds, personalTargetId: input.targetId, currentWorkItemId: input.currentWorkId }) },
    select: { id: true },
  });
  return Boolean(source);
}

function assignedWorkItemRowToOption(row: Prisma.WorkItemGetPayload<{ select: typeof assignedAlignmentItemSelect }>): FkOption {
  const targetText = row.krTargetValue === null ? null : `目标 ${row.krTargetValue}${row.krUnit ?? ""}`;
  const sourceLabel = row.targetType === "personal" ? "协作" : "承接";
  return {
    id: row.id,
    name: row.content,
    subtitle: [sourceLabel, nodeTypeLabel(row.itemType), row.plan?.okrCycle?.label, row.plan?.title, targetText].filter(Boolean).join(" · "),
    lifecycleStatus: "active",
  };
}

function unalignedAssignedWorkItemWhere(input: {
  employeeIds: number[];
  personalTargetId: number;
  currentWorkItemId?: number | null;
}): Prisma.WorkItemWhereInput {
  return {
    targetType: { in: ["department", "project", "personal"] },
    NOT: [{ targetType: "personal", targetId: input.personalTargetId }],
    ownerEmployeeId: { in: input.employeeIds },
    itemType: { in: ["objective", "key_result", "task"] },
    isArchived: false,
    OR: [{ status: null }, { status: { not: "done" } }],
    plan: { isArchived: false },
    childPeriodWorkItems: {
      none: {
        targetType: "personal",
        targetId: input.personalTargetId,
        ...(input.currentWorkItemId ? { id: { not: input.currentWorkItemId } } : {}),
      },
    },
  };
}

async function employeeIdsForUser(userId: number) {
  const rows = await prisma.employee.findMany({ where: { userId, employments: { some: { isActive: true } } }, select: { id: true } });
  return rows.map((row) => row.id);
}

function nodeTypeLabel(itemType: string) {
  if (itemType === "objective") return "目标";
  if (itemType === "key_result") return "KR";
  return "任务";
}

function normalizePositive(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
