import { prisma } from "@workspace/platform/server/prisma";

const PROJECT_MEMBER_NOTIFICATION_TYPES = [
  "work.project.member.added",
  "work.project.member.roleChanged",
] as const;

export async function findProjectMemberNotification(userId: number, notificationId: number) {
  return prisma.notification.findFirst({
    where: { id: notificationId, recipientUserId: userId, type: { in: [...PROJECT_MEMBER_NOTIFICATION_TYPES] } },
    select: { payloadJson: true, acknowledgedAt: true, rejectedAt: true },
  });
}

export async function findEmployeeForUser(employeeId: number, userId: number) {
  return prisma.employee.findFirst({ where: { id: employeeId, userId }, select: { id: true } });
}

export async function findProjectMemberFromNotification(input: {
  recordId: number | null;
  employeeId: number;
  projectId: number;
}) {
  return input.recordId
    ? prisma.employeeProject.findFirst({
        where: { id: input.recordId, employeeId: input.employeeId, projectId: input.projectId },
        select: { id: true, recordState: true },
      })
    : prisma.employeeProject.findFirst({
        where: { employeeId: input.employeeId, projectId: input.projectId, recordState: "confirmed" },
        orderBy: [{ sequence: "desc" }, { id: "desc" }],
        select: { id: true, recordState: true },
      });
}

export async function listPendingProjectMemberNotifications(userId: number) {
  return prisma.notification.findMany({
    where: {
      recipientUserId: userId,
      type: { in: [...PROJECT_MEMBER_NOTIFICATION_TYPES] },
      acknowledgedAt: null,
      rejectedAt: null,
    },
    select: { id: true, payloadJson: true },
  });
}
