import "server-only";

import type { ApprovalHandlerSource, ApprovalRequestRecord } from "./types";
import { isRootAdminUser } from "../auth/root";
import { currentOpenEndedDateWhere } from "../relation-registry";
import { prisma } from "../prisma";
import { findWorkflowApprovalTarget } from "../workflow-policy-nodes";

export async function resolveWorkflowNodeHandlerUserIds<TPayload>(
  request: ApprovalRequestRecord<TPayload>,
  input: {
    excludeUserId?: number | null;
    resolveRelationship: (source: ApprovalHandlerSource) => Promise<number[]> | number[];
    resolvePermission: () => Promise<number[]> | number[];
  },
) {
  const activeNode = findWorkflowApprovalTarget(request.workflowNodes, request.activeWorkflowNodeKey);
  if (!activeNode) return excludeRootAdminUserIds(
    dedupeUserIds(await input.resolvePermission(), input.excludeUserId ?? null),
  );

  const candidateLists = await Promise.all(activeNode.assignees.map(async (assignee) => {
    if (assignee.fieldKind === "relationship") {
      if (assignee.value === "direct_manager" || assignee.value === "department_owner") {
        return input.resolveRelationship(assignee.value);
      }
      return input.resolvePermission();
    }
    if (assignee.fieldKind === "position") return listActivePositionUserIds(assignee.value);
    if (assignee.fieldKind === "employee") return listEmployeeUserIds(assignee.value);
    return [];
  }));

  const rawResolved = dedupeUserIds(candidateLists.flat(), input.excludeUserId ?? null);
  const resolved = await excludeRootAdminUserIds(rawResolved);
  if (rawResolved.length > 0) return resolved;
  return excludeRootAdminUserIds(
    dedupeUserIds(await input.resolvePermission(), input.excludeUserId ?? null),
  );
}

async function excludeRootAdminUserIds(userIds: number[]) {
  const candidates = await Promise.all(userIds.map(async (userId) => (
    await isRootAdminUser(userId) ? null : userId
  )));
  return candidates.filter((userId): userId is number => userId !== null);
}

async function listActivePositionUserIds(value: string | null) {
  const positionId = positiveInteger(value);
  if (!positionId) return [];
  const employees = await prisma.employee.findMany({
    where: {
      userId: { not: null },
      employments: { some: { isActive: true } },
      positions: { some: currentOpenEndedDateWhere({ positionId }) },
    },
    select: { userId: true },
    orderBy: { employeeId: "asc" },
  });
  return employees.flatMap((employee) => employee.userId ? [employee.userId] : []);
}

async function listEmployeeUserIds(value: string | null) {
  const employeeId = positiveInteger(value);
  if (!employeeId) return [];
  const employee = await prisma.employee.findFirst({
    where: {
      id: employeeId,
      userId: { not: null },
      employments: { some: { isActive: true } },
    },
    select: { userId: true },
  });
  return employee?.userId ? [employee.userId] : [];
}

function positiveInteger(value: string | null) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function dedupeUserIds(userIds: number[], excludeUserId: number | null) {
  return Array.from(new Set(userIds.filter((id) => Number.isInteger(id) && id > 0 && id !== excludeUserId)));
}
