import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { prisma } from "@workspace/platform/server/prisma";
import { canEditProject, canViewProject } from "./access";
import { normalizeProjectPlanText, validateProjectPlanCommand } from "./domain/project-plan-validation";
import { deriveStatusFromActualDates } from "./project-dates";

type BaselineInput = {
  name?: unknown;
  note?: unknown;
};

export async function listProjectPlanBaselines(input: { userId: number; projectId: number }) {
  if (!(await canViewProject(input.userId, input.projectId))) return serviceError("无权限", 403);
  const baselines = await prisma.projectPlanBaseline.findMany({
    where: { projectId: input.projectId },
    orderBy: [{ isActive: "desc" }, { id: "desc" }],
    select: { id: true, name: true, note: true, isActive: true, createdAt: true },
  });
  return serviceOk({ baselines: baselines.map((baseline) => ({ ...baseline, createdAt: baseline.createdAt.toISOString() })) });
}

export async function createProjectPlanBaseline(input: { userId: number; projectId: number; body: BaselineInput }) {
  if (!(await canEditProject(input.userId, input.projectId))) return serviceError("无权限", 403);
  const name = normalizeProjectPlanText(input.body.name) || `基准 ${new Date().toISOString().slice(0, 10)}`;
  const note = normalizeProjectPlanText(input.body.note) || null;
  const snapshot = await buildBaselineSnapshot(input.projectId);
  const baseline = await prisma.$transaction(async (tx) => {
    await tx.projectPlanBaseline.updateMany({ where: { projectId: input.projectId }, data: { isActive: false } });
    return tx.projectPlanBaseline.create({
      data: {
        projectId: input.projectId,
        name,
        note,
        isActive: true,
        createdBy: input.userId,
        editedBy: input.userId,
        items: { create: snapshot },
      },
    });
  });
  return serviceOk({ baseline: { id: baseline.id, name: baseline.name, note: baseline.note, isActive: baseline.isActive } });
}

export async function activateProjectPlanBaseline(input: { userId: number; projectId: number; baselineId: number }) {
  const command = validateProjectPlanCommand("activateProjectPlanBaseline");
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  if (!(await canEditProject(input.userId, input.projectId))) return serviceError("无权限", 403);
  const baseline = await prisma.projectPlanBaseline.findUnique({ where: { id: input.baselineId }, select: { projectId: true } });
  if (!baseline || baseline.projectId !== input.projectId) return serviceError("基准不存在", 404);
  await prisma.$transaction(async (tx) => {
    await tx.projectPlanBaseline.updateMany({ where: { projectId: input.projectId }, data: { isActive: false } });
    await tx.projectPlanBaseline.update({ where: { id: input.baselineId }, data: { isActive: true, editedBy: input.userId, editedAt: new Date(), version: { increment: 1 } } });
  });
  return serviceOk({ success: true });
}

async function buildBaselineSnapshot(projectId: number) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      parentProjectTask: {
        select: {
          baselineStartDate: true,
          baselineEndDate: true,
          startDate: true,
          endDate: true,
        },
      },
      planPhases: { orderBy: [{ sequenceNo: "asc" }, { id: "asc" }] },
      tasks: true,
    },
  });
  if (!project) return [];
  const projectDates = project.parentProjectTask || project;
  return [
    baselineItem("project", project.id, null, null, null, project.name, deriveStatusFromActualDates(projectDates.startDate, projectDates.endDate), true, projectDates.baselineStartDate ?? projectDates.startDate, projectDates.baselineEndDate ?? projectDates.endDate),
    ...project.planPhases.map((phase) => baselineItem("phase", phase.id, "project", project.id, null, phase.name, null, false, phase.startDate, phase.endDate)),
    ...project.tasks.map((task) => baselineItem("task", task.id, "project", project.id, task.planPhaseId, task.name, null, task.isMilestone, task.baselineStartDate ?? task.startDate, task.baselineEndDate ?? task.endDate)),
  ];
}

function baselineItem(
  itemKind: string,
  itemId: number,
  parentKind: string | null,
  parentId: number | null,
  phaseId: number | null,
  name: string,
  status: string | null,
  isMilestone: boolean,
  startDate: Date | null,
  endDate: Date | null,
) {
  return { itemKind, itemId, parentKind, parentId, phaseId, name, status, isMilestone, startDate, endDate };
}
