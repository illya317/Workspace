import "server-only";

import { prisma } from "@workspace/platform/server/prisma";

import type { ProjectNotificationSnapshot } from "./domain/project-notification-condition";
import type { ProjectNotificationSignalKind } from "./project-notification-signal-contract";

export async function loadProjectNotificationPreviewSnapshot(projectId: number) {
  return prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      projectLevel: true,
      completionPercent: true,
      plannedStartDate: true,
      plannedEndDate: true,
      riskNote: true,
      isArchived: true,
    },
  });
}

export function toProjectNotificationPreviewConditionSnapshot(
  project: NonNullable<Awaited<ReturnType<typeof loadProjectNotificationPreviewSnapshot>>>,
  signalKind: ProjectNotificationSignalKind,
  changedField: string,
): ProjectNotificationSnapshot {
  return {
    project: {
      status: project.status,
      projectLevel: project.projectLevel,
      completionPercent: project.completionPercent,
      plannedStartDate: project.plannedStartDate?.toISOString().slice(0, 10) ?? null,
      plannedEndDate: project.plannedEndDate?.toISOString().slice(0, 10) ?? null,
      riskPresent: Boolean(project.riskNote?.trim()),
      isArchived: project.isArchived,
    },
    signal: { kind: signalKind, changedField },
  };
}
