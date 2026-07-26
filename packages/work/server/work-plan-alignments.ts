import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { currentEmploymentDateWhere } from "@workspace/platform/server/relation-registry";
import { validateWorkPlanAlignmentReplaceCommand } from "./domain/work-plan-alignment-validation";

export type WorkPlanAlignmentSourceType = "plan" | "objective" | "key_result";

export type WorkPlanAlignmentInput = {
  sourceType: WorkPlanAlignmentSourceType;
  sourcePlanId: number | null;
  sourceWorkItemId: number | null;
} | null;

type PeriodRange = {
  startDate: Date;
  endDate: Date;
};

export function normalizeWorkPlanAlignmentInput(
  input: {
    alignmentSourceType?: string | null;
    alignmentSourcePlanId?: number | null;
    alignmentSourceWorkItemId?: number | null;
  },
  enabled: boolean,
): { ok: true; data: WorkPlanAlignmentInput | undefined } | { ok: false; error: string } {
  const touched = Object.prototype.hasOwnProperty.call(input, "alignmentSourceType")
    || Object.prototype.hasOwnProperty.call(input, "alignmentSourcePlanId")
    || Object.prototype.hasOwnProperty.call(input, "alignmentSourceWorkItemId");
  if (!touched) return { ok: true, data: undefined };
  if (!enabled) return { ok: true, data: null };
  const sourceType = normalizeSourceType(input.alignmentSourceType);
  if (!sourceType) return { ok: true, data: null };
  const sourcePlanId = normalizeNullablePositiveId(input.alignmentSourcePlanId);
  const sourceWorkItemId = normalizeNullablePositiveId(input.alignmentSourceWorkItemId);
  if (sourceType === "plan") {
    if (!sourcePlanId || sourceWorkItemId) return { ok: false, error: "上级计划无效" };
    return { ok: true, data: { sourceType, sourcePlanId, sourceWorkItemId: null } };
  }
  if (!sourceWorkItemId || sourcePlanId) return { ok: false, error: "对齐或上级目标无效" };
  return { ok: true, data: { sourceType, sourcePlanId: null, sourceWorkItemId } };
}

export async function validateWorkPlanAlignmentSource(input: {
  actorUserId?: number | null;
  currentPlanId?: number | null;
  targetType: string;
  targetId: number;
  okrCycleId?: number | null;
  alignment: WorkPlanAlignmentInput | undefined;
}) {
  if (input.alignment === undefined || input.alignment === null) return null;
  const currentCycle = input.okrCycleId
    ? await prisma.workOkrCycle.findUnique({ where: { id: input.okrCycleId }, select: { startDate: true, endDate: true } })
    : null;
  if (!currentCycle) return "选择对齐到或上级前必须先选择所属周期";
  if (input.alignment.sourceType === "plan") {
    const source = await prisma.workPlan.findUnique({
      where: { id: input.alignment.sourcePlanId ?? 0 },
      select: { id: true, targetType: true, targetId: true, kind: true, isArchived: true, okrCycle: { select: { startDate: true, endDate: true } } },
    });
    if (!source) return "上级计划不存在";
    if (input.currentPlanId && source.id === input.currentPlanId) return "上级计划不能选择当前计划";
    if (source.targetType !== input.targetType || source.targetId !== input.targetId) return "上级计划不属于当前空间";
    if (source.kind !== "okr" || source.isArchived || !source.okrCycle) return "上级计划必须来自有效 OKR 计划";
    return upperCycleMatches(source.okrCycle, currentCycle) ? null : "上级计划必须来自上级周期";
  }
  const source = await prisma.workItem.findUnique({
    where: { id: input.alignment.sourceWorkItemId ?? 0 },
    select: {
      id: true,
      targetType: true,
      targetId: true,
      itemType: true,
      ownerEmployeeId: true,
      status: true,
      isArchived: true,
      plan: { select: { kind: true, status: true, isArchived: true, okrCycle: { select: { startDate: true, endDate: true } } } },
    },
  });
  if (!source) return "对齐或上级目标不存在";
  if (source.itemType !== input.alignment.sourceType) return "对齐或上级目标类型不匹配";
  if (source.isArchived || source.plan?.kind !== "okr" || source.plan.isArchived || !source.plan.okrCycle) return "对齐或上级目标必须来自有效 OKR 计划";
  const assignedSource = await isUnalignedAssignedAlignmentSource({
    source,
    sourceId: source.id,
    personalUserId: input.actorUserId ?? (input.targetType === "personal" ? input.targetId : null),
    targetType: input.targetType,
    targetId: input.targetId,
    currentPlanId: input.currentPlanId,
  });
  if (source.targetType !== input.targetType || source.targetId !== input.targetId) {
    if (!assignedSource) return "对齐到内容必须来自未完成且未对齐的承接/协作事项";
    return null;
  }
  return upperCycleMatches(source.plan.okrCycle, currentCycle)
    ? null
    : "上级目标或 KR 必须来自上级周期";
}

export async function replaceWorkPlanDecomposeAlignment(
  tx: Prisma.TransactionClient,
  childPlanId: number,
  alignment: WorkPlanAlignmentInput | undefined,
) {
  const commandError = validateWorkPlanAlignmentReplaceCommand({ childPlanId, alignment });
  if (commandError) throw new Error(commandError);
  if (alignment === undefined) return;
  await tx.workPlanAlignment.deleteMany({
    where: { childPlanId, relationKind: "decompose" },
  });
  if (!alignment) return;
  await tx.workPlanAlignment.create({
    data: {
      childPlanId,
      sourceType: alignment.sourceType,
      sourcePlanId: alignment.sourceType === "plan" ? alignment.sourcePlanId : null,
      sourceWorkItemId: alignment.sourceType === "plan" ? null : alignment.sourceWorkItemId,
      relationKind: "decompose",
      sortOrder: 0,
    },
  });
}

function normalizeSourceType(value: string | null | undefined): WorkPlanAlignmentSourceType | null {
  if (value === "plan" || value === "objective" || value === "key_result") return value;
  return null;
}

function normalizeNullablePositiveId(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function upperCycleMatches(source: PeriodRange, current: PeriodRange) {
  return source.startDate <= current.startDate
    && source.endDate >= current.endDate
    && periodDayCount(source) > periodDayCount(current);
}

function periodDayCount(period: PeriodRange) {
  return Math.floor((periodDateValue(period.endDate) - periodDateValue(period.startDate)) / 86_400_000) + 1;
}

function periodDateValue(value: Date) {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

async function isUnalignedAssignedAlignmentSource(input: {
  sourceId: number;
  source: {
    targetType: string;
    targetId: number | null;
    ownerEmployeeId: number | null;
    status: string | null;
    plan: { status: string; isArchived: boolean; okrCycle: PeriodRange | null } | null;
  };
  personalUserId?: number | null;
  targetType: string;
  targetId: number;
  currentPlanId?: number | null;
}) {
  if (input.targetType !== "personal" || input.personalUserId !== input.targetId) return false;
  if (!input.source.ownerEmployeeId || input.source.status === "done") return false;
  if (input.source.targetType === "personal" && input.source.targetId === input.targetId) return false;
  if (input.source.plan?.status === "done" || input.source.plan?.isArchived) return false;
  const employees = await prisma.employee.findMany({
    where: { userId: input.personalUserId, employments: { some: currentEmploymentDateWhere() } },
    select: { id: true },
  });
  if (!employees.some((employee) => employee.id === input.source.ownerEmployeeId)) return false;
  const existing = await prisma.workPlanAlignment.findFirst({
    where: {
      sourceWorkItemId: input.sourceId,
      relationKind: "decompose",
      childPlan: {
        targetType: "personal",
        targetId: input.targetId,
        ...(input.currentPlanId ? { id: { not: input.currentPlanId } } : {}),
      },
    },
    select: { id: true },
  });
  return !existing;
}
