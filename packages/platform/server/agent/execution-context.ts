import "server-only";

import { getAgentActorSessionUser } from "../auth/session";
import { prisma } from "@workspace/platform/server/prisma";
import type { SessionUser } from "@workspace/platform/types";

import {
  createHumanAgentExecutionContext,
  type AgentExecutionContext,
  type AgentProfileIdentity,
} from "./execution";
import {
  agentBusinessDate,
  isAgentDateOnlyRangeActive,
  isAgentDateTimeEndActive,
} from "./active-date-policy";
import {
  ACTIVE_WORKSPACE_RUNTIME_WHERE,
  normalizeAgentRuntimeInstructions,
  parseAgentCapabilityKeys,
} from "./runtime-binding";

const VIRTUAL_EMPLOYEE_PERSONNEL_TYPE = "虚拟员工";

export class AgentExecutionError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "AgentExecutionError";
  }
}

export async function resolveAgentExecutionContext(
  requester: SessionUser,
  profileId?: number | null,
): Promise<AgentExecutionContext> {
  if (profileId == null) return createHumanAgentExecutionContext(requester);

  const profile = await prisma.agentProfile.findUnique({
    where: { id: profileId },
    select: {
      id: true,
      key: true,
      actorUserId: true,
      displayName: true,
      roleName: true,
      responsibilities: true,
      status: true,
      runtimeBindings: {
        where: ACTIVE_WORKSPACE_RUNTIME_WHERE,
        orderBy: { id: "asc" },
        take: 1,
        select: {
          id: true,
          runtimeKind: true,
          capabilityKeysJson: true,
          instructions: true,
        },
      },
      actorUser: {
        select: {
          canLogin: true,
          employeeId: true,
          employees: {
            select: {
              id: true,
              employeeId: true,
              name: true,
              employments: {
                where: { isActive: true },
                select: { id: true, personnelType: true },
              },
              positions: {
                select: {
                  startDate: true,
                  endDate: true,
                  position: { select: { isArchived: true, endDate: true } },
                  department: { select: { isArchived: true, endDate: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!profile || profile.status !== "active") {
    throw new AgentExecutionError("Agent 配置不存在或已停用", 404);
  }
  const runtimeBinding = profile.runtimeBindings[0];
  if (!runtimeBinding) {
    throw new AgentExecutionError("Agent 未绑定可用的 Workspace 交互运行时", 409);
  }
  if (profile.actorUser.canLogin) {
    throw new AgentExecutionError("Agent 执行账号必须禁止登录", 409);
  }
  if (profile.actorUser.employees.length !== 1) {
    throw new AgentExecutionError("Agent 执行账号必须且只能绑定一名员工", 409);
  }

  const employee = profile.actorUser.employees[0];
  if (profile.actorUser.employeeId !== employee.employeeId) {
    throw new AgentExecutionError("Agent 执行账号与员工工号绑定不一致", 409);
  }
  if (
    employee.employments.length !== 1
    || employee.employments[0].personnelType !== VIRTUAL_EMPLOYEE_PERSONNEL_TYPE
  ) {
    throw new AgentExecutionError("Agent 必须绑定一条有效的虚拟员工任职", 409);
  }

  const today = agentBusinessDate(new Date());
  const hasActivePosition = employee.positions.some((edp) => (
    isAgentDateOnlyRangeActive(edp.startDate, edp.endDate, today)
    && Boolean(edp.position)
    && !edp.position?.isArchived
    && isAgentDateTimeEndActive(edp.position?.endDate ?? null, today)
    && Boolean(edp.department)
    && !edp.department?.isArchived
    && isAgentDateTimeEndActive(edp.department?.endDate ?? null, today)
  ));
  if (!hasActivePosition) {
    throw new AgentExecutionError("Agent 虚拟员工没有有效的部门岗位", 409);
  }

  const actor = await getAgentActorSessionUser(profile.actorUserId);
  if (!actor || !actor.isActiveEmployee) {
    throw new AgentExecutionError("Agent 执行身份不可用", 409);
  }

  let allowedToolKeys: string[];
  let runtimeInstructions: string;
  try {
    allowedToolKeys = parseAgentCapabilityKeys(runtimeBinding.capabilityKeysJson);
    runtimeInstructions = normalizeAgentRuntimeInstructions(runtimeBinding.instructions);
  } catch {
    throw new AgentExecutionError("Agent 运行时配置无效", 409);
  }

  const identity: AgentProfileIdentity = {
    id: profile.id,
    key: profile.key,
    displayName: profile.displayName,
    roleName: profile.roleName,
    responsibilities: profile.responsibilities,
    allowedToolKeys,
    runtime: {
      bindingId: runtimeBinding.id,
      kind: "workspace",
      instructions: runtimeInstructions,
    },
    actorEmployeeId: employee.employeeId,
    actorEmployeeName: employee.name,
  };
  return { requester, actor, profile: identity };
}

export async function resolveStoredAgentExecutionContext(
  requester: SessionUser,
  actorUserId: number,
  profileId: number | null,
) {
  if (profileId == null) {
    if (actorUserId !== requester.id) {
      throw new AgentExecutionError("旧提案的执行身份不一致", 409);
    }
    return createHumanAgentExecutionContext(requester);
  }
  const execution = await resolveAgentExecutionContext(requester, profileId);
  if (execution.actor.id !== actorUserId) {
    throw new AgentExecutionError("提案绑定的 Agent 执行身份已变更", 409);
  }
  return execution;
}
