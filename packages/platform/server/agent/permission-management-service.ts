import "server-only";

import { randomUUID } from "node:crypto";
import { serviceError, serviceOk, type ServiceResult } from "../api";
import { isRootAdminUser } from "../auth/root";
import { ensureEditHistoryBaseline, snapshotHistory } from "../history";
import { getPermissionGrantData, type PermissionGrantData } from "../permission-subjects";
import { prisma } from "../prisma";
import {
  canManageResourceGrant,
  getManageableResourceKeys,
  manageableResourceKeysAllowGrant,
} from "../rbac/admin-scope";
import { authorizePermissionGrantRequest } from "../rbac/action-grant-request";
import {
  PermissionGrantMutationError,
  evaluatePermissionAction,
  setSubjectPermissionActionGrants,
} from "../rbac/action-grants";

import type {
  AgentActionCeilingUpdateRequest,
  AgentPermissionGrantBatchRequest,
} from "./permission-management-schema";
import {
  validateAgentActionCeilingUpdate,
  validateAgentPermissionGrantBatch,
  type AgentActionCeilingUpdateCommand,
  type AgentPermissionGrantBatchCommand,
  type AgentPermissionSubjectType,
} from "./domain/permission-management-validation";
import { listRegisteredAgentCapabilityKeys } from "./permission-resource-directory";

const AGENT_PERMISSION_POLICY_HISTORY_ID = 1;

export type AgentPermissionGrantData = Pick<
  PermissionGrantData,
  "resourceActions" | "canMutateGrantAction" | "actionRecords"
> & {
  subjects: Array<{
    id: number;
    name: string;
    extra?: Record<string, unknown>;
  }>;
};

function projectPermissionSubjects(
  data: PermissionGrantData,
  subjectType: AgentPermissionSubjectType,
): AgentPermissionGrantData["subjects"] {
  return data.subjects.map((subject) => {
    if (subjectType === "user") return {
      id: subject.id,
      name: subject.name,
      extra: {
        employeeId: subject.extra?.employeeId,
        userId: subject.extra?.userId,
        hasUser: Boolean(subject.extra?.hasUser),
        department: subject.extra?.department,
        position: subject.extra?.position,
      },
    };
    if (subjectType === "position") return {
      id: subject.id,
      name: subject.name,
      extra: {
        code: subject.extra?.code,
        department: subject.extra?.department,
      },
    };
    return {
      id: subject.id,
      name: subject.name,
      extra: { code: subject.extra?.code },
    };
  });
}

export function buildAgentActionCeilingUpdateCommand(input: {
  editorUserId: number;
  request: AgentActionCeilingUpdateRequest;
}) {
  return validateAgentActionCeilingUpdate({
    editorUserId: input.editorUserId,
    actionKeys: input.request.actionKeys,
  });
}

export async function executeAgentActionCeilingUpdateCommand(
  command: AgentActionCeilingUpdateCommand,
): Promise<ServiceResult<{ actionKeys: AgentActionCeilingUpdateCommand["actionKeys"] }>> {
  return prisma.$transaction(async (tx) => {
    await ensureEditHistoryBaseline(
      "AgentPermissionPolicy",
      AGENT_PERMISSION_POLICY_HISTORY_ID,
      command.editorUserId,
      tx,
    );
    await tx.systemConfig.upsert({
      where: { key: "agentAllowedActions" },
      update: { value: JSON.stringify(command.actionKeys) },
      create: { key: "agentAllowedActions", value: JSON.stringify(command.actionKeys) },
    });
    await snapshotHistory(
      "AgentPermissionPolicy",
      AGENT_PERMISSION_POLICY_HISTORY_ID,
      command.editorUserId,
      tx,
    );
    return serviceOk({ actionKeys: command.actionKeys });
  });
}

export function buildAgentPermissionGrantBatchCommand(input: {
  actorUserId: number;
  request: AgentPermissionGrantBatchRequest;
}) {
  return validateAgentPermissionGrantBatch({
    actorUserId: input.actorUserId,
    changes: input.request.changes,
  }, {
    registeredAgentResourceKeys: listRegisteredAgentCapabilityKeys(),
  });
}

export async function getAgentPermissionGrantDataForActor(input: {
  actorUserId: number;
  subjectType: AgentPermissionSubjectType;
  resourceKey: string;
}): Promise<ServiceResult<AgentPermissionGrantData>> {
  if (!listRegisteredAgentCapabilityKeys().includes(input.resourceKey)) {
    return serviceError("只能维护已注册的 Agent 能力资源", 400);
  }
  if (!await evaluatePermissionAction(input.actorUserId, "agent.config", "read")) {
    return serviceError("无权限读取 Agent 配置", 403);
  }
  if (!await canManageResourceGrant(input.actorUserId, input.resourceKey, "grant")) {
    return serviceError("无权限管理该 Agent 能力资源", 403);
  }
  const data = await getPermissionGrantData(
    input.subjectType,
    input.resourceKey,
    null,
    { canMutateGrantAction: true },
  );
  return serviceOk({
    subjects: projectPermissionSubjects(data, input.subjectType),
    resourceActions: data.resourceActions,
    canMutateGrantAction: data.canMutateGrantAction,
    actionRecords: data.actionRecords,
  });
}

export async function executeAgentPermissionGrantBatchCommand(
  command: AgentPermissionGrantBatchCommand,
): Promise<ServiceResult<{ success: true; changedCount: number; batchId: string }>> {
  const batchId = `agent-config-permission-${randomUUID()}`;
  try {
    const results = await setSubjectPermissionActionGrants(
      command.changes.map((change) => ({
        subjectType: change.subjectType,
        subjectId: change.subjectId,
        resourceKey: change.resourceKey,
        actionKey: change.actionKey,
        value: change.value,
        scopeId: null,
      })),
      {
        actorUserId: command.actorUserId,
        source: "agent_config",
        batchId,
        authorizationResourceKeys: [
          "agent.config",
          ...new Set(command.changes.map((change) => change.resourceKey)),
        ],
        beforeMutation: async (tx) => {
          if (!await evaluatePermissionAction(command.actorUserId, "agent.config", "read", { client: tx })) {
            throw new PermissionGrantMutationError("无权限读取 Agent 配置", 403);
          }
          const isSystemAdmin = await isRootAdminUser(command.actorUserId, tx);
          const manageableResourceKeys = await getManageableResourceKeys(command.actorUserId, tx);
          const deniedResourceKey = [...new Set(command.changes.map((change) => change.resourceKey))]
            .find((resourceKey) => !manageableResourceKeysAllowGrant(manageableResourceKeys, resourceKey));
          if (deniedResourceKey) {
            throw new PermissionGrantMutationError("无权限管理该 Agent 能力资源", 403);
          }
          const authorizations = await Promise.all(command.changes.map((change) => (
            authorizePermissionGrantRequest({
              ...change,
              actorUserId: command.actorUserId,
              isSystemAdmin,
              preauthorizedActor: true,
            }, { client: tx })
          )));
          const denied = authorizations.find((authorization) => !authorization.ok);
          if (denied && !denied.ok) {
            throw new PermissionGrantMutationError(denied.error, denied.status ?? 403);
          }
        },
      },
    );
    return serviceOk({
      success: true,
      changedCount: results.filter((result) => result.changed).length,
      batchId,
    });
  } catch (error) {
    if (error instanceof PermissionGrantMutationError) return serviceError(error.message, error.status);
    throw error;
  }
}
