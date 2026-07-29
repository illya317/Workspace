import "server-only";

import type { ApprovalHandlerSource, ApprovalRequestRecord } from "./types";
import { isRootAdminUser } from "../auth/root";
import { findWorkflowApprovalTarget } from "../workflow-policy-nodes";
import {
  listActiveEmployeeUserIds,
  listActivePositionUserIds,
} from "./workflow-node-handler-reference-adapter";

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
    if (assignee.fieldKind === "position") {
      const positionId = positiveInteger(assignee.value);
      return positionId ? listActivePositionUserIds(positionId) : [];
    }
    if (assignee.fieldKind === "employee") {
      const employeeId = positiveInteger(assignee.value);
      return employeeId ? listActiveEmployeeUserIds(employeeId) : [];
    }
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

function positiveInteger(value: string | null) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function dedupeUserIds(userIds: number[], excludeUserId: number | null) {
  return Array.from(new Set(userIds.filter((id) => Number.isInteger(id) && id > 0 && id !== excludeUserId)));
}
