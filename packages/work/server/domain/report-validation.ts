import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import { prisma } from "@workspace/platform/server/prisma";
import { canSubmitToTarget } from "../access";

export interface ReportItemCommand {
  category: string;
  plan: string;
  completion?: string;
  nextGoal?: string;
  sortOrder?: number;
  workId?: number;
}

export interface CreateReportCommand {
  userId: number;
  taskName: string;
  notes: string | null;
  date: string;
  targetType: string;
  targetId: number;
  items: ReportItemCommand[];
}

export interface UpdateReportCommand {
  reportId: number;
  taskName: string;
  notes: string | null;
  items: ReportItemCommand[];
  existing: {
    version: number;
    taskName: string;
    notes: string | null;
  };
  currentItems: unknown[];
}

interface AuthenticatedWorkUser {
  userId: number;
  departmentId: number;
}

function normalizeReportItems(items: ReportItemCommand[]) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const normalized = items.map((item) => ({
    category: String(item.category || "").trim(),
    plan: String(item.plan || "").trim(),
    completion: item.completion || "",
    nextGoal: item.nextGoal || "",
    sortOrder: item.sortOrder,
    workId: item.workId,
  }));
  return normalized.every((item) => item.category && item.plan) ? normalized : null;
}

async function enrichWithRoutineItems(
  items: ReportItemCommand[],
  targetType: string,
  targetId: number,
): Promise<ReportItemCommand[]> {
  const hasRoutine = items.some((item) => item.category === "routine");
  if (hasRoutine) return items;

  const works = await prisma.workItem.findMany({
    where: { targetType, targetId, category: "routine" },
    orderBy: { sortOrder: "asc" },
  });
  if (works.length === 0) return items;

  const routineItems = works.map((work, index) => ({
    category: "routine",
    plan: work.content,
    completion: "",
    nextGoal: "",
    sortOrder: index,
    workId: work.id,
  }));
  return [...routineItems, ...items];
}

export async function buildCreateReportCommand(
  user: AuthenticatedWorkUser,
  input: Omit<CreateReportCommand, "userId" | "date" | "notes" | "targetType" | "targetId"> & {
    notes?: string | null;
    date?: string;
    targetType?: string;
    targetId?: number;
  },
): Promise<DomainValidationResult<CreateReportCommand>> {
  const targetType = input.targetType ?? "department";
  const targetId = input.targetId ?? user.departmentId;
  const allowed = await canSubmitToTarget(user.userId, targetType, targetId);
  if (!allowed) return failCommand("无权限提交该目标周报", 403);

  const normalizedItems = normalizeReportItems(input.items);
  if (!normalizedItems) return failCommand("请填写至少一条工作项");

  const date = input.date ?? new Date().toISOString().slice(0, 10);
  const items = await enrichWithRoutineItems(normalizedItems, targetType, targetId);
  return okCommand({
    userId: user.userId,
    taskName: input.taskName,
    notes: input.notes || null,
    date,
    targetType,
    targetId,
    items,
  });
}

export async function buildUpdateReportCommand(
  reportId: number,
  data: {
    taskName: string;
    notes?: string | null;
    items: ReportItemCommand[];
  },
): Promise<DomainValidationResult<UpdateReportCommand>> {
  const existing = await prisma.report.findUnique({ where: { id: reportId } });
  if (!existing) return failCommand("报告不存在", 404);

  const normalizedItems = normalizeReportItems(data.items);
  if (!normalizedItems) return failCommand("请填写任务名称和至少一条工作项");

  const currentItems = await prisma.reportItem.findMany({
    where: { reportId },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });

  return okCommand({
    reportId,
    taskName: data.taskName,
    notes: data.notes || null,
    items: normalizedItems,
    existing,
    currentItems,
  });
}
