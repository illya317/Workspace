import "server-only";

import { serviceError, serviceOk, type ServiceResult } from "@workspace/platform/server/api";
import { failCommand } from "@workspace/platform/server/domain-validation";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { prisma } from "@workspace/platform/server/prisma";
import type { AgentConfigurationUpdateResult } from "@workspace/platform/types";

import { listConfigurableWorkspaceCapabilities } from "./configuration-capabilities";
import type { AgentConfigurationUpdateRequest } from "./configuration-schema";
import {
  validateAgentConfigurationUpdate,
  type AgentConfigurationUpdateCommand,
} from "./domain/configuration-validation";
import { AGENT_RUNTIME_KINDS, type AgentRuntimeKind } from "./runtime-binding";
import type { AgentTool } from "./tools";

function asRuntimeKind(value: string): AgentRuntimeKind | null {
  return Object.values(AGENT_RUNTIME_KINDS).includes(value as AgentRuntimeKind)
    ? value as AgentRuntimeKind
    : null;
}

export async function buildAgentConfigurationUpdateCommand(input: {
  editorUserId: number;
  request: AgentConfigurationUpdateRequest;
  registeredWorkspaceTools: readonly AgentTool[];
}) {
  const profile = await prisma.agentProfile.findUnique({
    where: { id: input.request.profileId },
    select: { id: true, actorUserId: true },
  });
  if (!profile) return failCommand("Agent 档案不存在", 404, "profileId");

  const binding = input.request.runtime
    ? await prisma.agentRuntimeBinding.findUnique({
        where: { id: input.request.runtime.id },
        select: { id: true, agentProfileId: true, runtimeKind: true },
      })
    : null;
  const runtimeKind = binding ? asRuntimeKind(binding.runtimeKind) : null;
  if (binding && !runtimeKind) return failCommand("运行时类型不受支持", 409, "runtime.id");

  const availableWorkspaceCapabilities = runtimeKind === AGENT_RUNTIME_KINDS.workspace
    ? await listConfigurableWorkspaceCapabilities(profile.actorUserId, input.registeredWorkspaceTools)
    : [];
  const validation = validateAgentConfigurationUpdate({
    editorUserId: input.editorUserId,
    profileId: input.request.profileId,
    profile: input.request.profile,
    runtime: input.request.runtime,
  }, {
    profileId: profile.id,
    runtime: binding && runtimeKind ? { ...binding, runtimeKind } : null,
    availableWorkspaceCapabilityKeys: availableWorkspaceCapabilities.map((capability) => capability.key),
  });
  return validation;
}

export async function executeAgentConfigurationUpdateCommand(
  command: AgentConfigurationUpdateCommand,
): Promise<ServiceResult<AgentConfigurationUpdateResult>> {
  return prisma.$transaction(async (tx) => {
    const currentProfile = await tx.agentProfile.findUnique({
      where: { id: command.profileId },
      select: { id: true },
    });
    if (!currentProfile) return serviceError("Agent 档案已不存在", 404);

    if (command.runtime) {
      const currentBinding = await tx.agentRuntimeBinding.findUnique({
        where: { id: command.runtime.id },
        select: { id: true, agentProfileId: true, runtimeKind: true },
      });
      if (
        !currentBinding
        || currentBinding.agentProfileId !== command.profileId
        || currentBinding.runtimeKind !== command.runtime.runtimeKind
      ) {
        return serviceError("运行时绑定已变更，请刷新后重试", 409);
      }
    }

    let updatedProfile: AgentConfigurationUpdateResult["profile"] = null;
    if (command.profile) {
      await ensureEditHistoryBaseline("AgentProfile", command.profileId, command.editorUserId, tx);
      const saved = await tx.agentProfile.update({
        where: { id: command.profileId },
        data: {
          displayName: command.profile.displayName,
          roleName: command.profile.roleName,
          responsibilities: command.profile.responsibilities,
          status: command.profile.status,
          editedBy: command.editorUserId,
        },
        select: {
          id: true,
          displayName: true,
          roleName: true,
          responsibilities: true,
          status: true,
          updatedAt: true,
        },
      });
      await snapshotHistory("AgentProfile", command.profileId, command.editorUserId, tx);
      updatedProfile = { ...saved, updatedAt: saved.updatedAt.toISOString() };
    }

    let updatedRuntime: AgentConfigurationUpdateResult["runtime"] = null;
    if (command.runtime) {
      await ensureEditHistoryBaseline("AgentRuntimeBinding", command.runtime.id, command.editorUserId, tx);
      const saved = await tx.agentRuntimeBinding.update({
        where: { id: command.runtime.id },
        data: {
          status: command.runtime.status,
          interactive: command.runtime.interactive,
          instructions: command.runtime.instructions,
          capabilityKeysJson: JSON.stringify(command.runtime.capabilityKeys),
          editedBy: command.editorUserId,
        },
        select: {
          id: true,
          status: true,
          interactive: true,
          instructions: true,
          updatedAt: true,
        },
      });
      await snapshotHistory("AgentRuntimeBinding", command.runtime.id, command.editorUserId, tx);
      updatedRuntime = {
        id: saved.id,
        status: saved.status,
        interactive: saved.interactive,
        instructions: saved.instructions,
        capabilityKeys: command.runtime.capabilityKeys,
        updatedAt: saved.updatedAt.toISOString(),
      };
    }

    return serviceOk({ profile: updatedProfile, runtime: updatedRuntime });
  });
}
