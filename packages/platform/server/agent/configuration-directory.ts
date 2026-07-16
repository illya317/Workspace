import "server-only";

import type {
  AgentConfigurationData,
  AgentManagementRuntimeKind,
} from "@workspace/platform/types";
import { getSystemConfig } from "@workspace/platform/server/system-config";

import { prisma } from "../prisma";
import { listConfigurableWorkspaceCapabilities } from "./configuration-capabilities";
import {
  listAgentPermissionResourcesForActor,
  listRegisteredAgentCapabilityResources,
} from "./permission-resource-directory";
import { parseAgentCapabilityKeys } from "./runtime-binding";
import type { AgentTool } from "./tools";

function parseRuntimeCapabilities(value: string) {
  try {
    return { keys: parseAgentCapabilityKeys(value), valid: true };
  } catch {
    return { keys: [], valid: false };
  }
}

function asRuntimeKind(value: string): AgentManagementRuntimeKind {
  if (value === "workspace" || value === "codex_local" || value === "ci" || value === "server_ops") {
    return value;
  }
  throw new Error(`Unsupported Agent runtime kind: ${value}`);
}

export async function getAgentConfigurationData(options: {
  registeredWorkspaceTools?: readonly AgentTool[];
  viewerUserId?: number;
} = {}): Promise<AgentConfigurationData> {
  const [profiles, systemConfig, permissionResources] = await Promise.all([
    prisma.agentProfile.findMany({
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      select: {
        id: true,
        actorUserId: true,
        key: true,
        displayName: true,
        roleName: true,
        responsibilities: true,
        status: true,
        actorUser: {
          select: {
            username: true,
            employeeId: true,
            canLogin: true,
            employees: {
              orderBy: { id: "asc" },
              take: 1,
              select: {
                employeeId: true,
                name: true,
                positions: {
                  orderBy: [{ isPrimary: "desc" }, { id: "desc" }],
                  take: 1,
                  select: {
                    department: { select: { name: true } },
                    position: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
        runtimeBindings: {
          orderBy: [{ runtimeKind: "asc" }, { id: "asc" }],
          select: {
            id: true,
            runtimeKind: true,
            status: true,
            interactive: true,
            capabilityKeysJson: true,
            instructions: true,
          },
        },
      },
    }),
    getSystemConfig(),
    options.viewerUserId
      ? listAgentPermissionResourcesForActor(options.viewerUserId)
      : Promise.resolve(listRegisteredAgentCapabilityResources().map((resource) => ({
          ...resource,
          grantManageable: false,
        }))),
  ]);

  const workspaceCapabilitiesByProfileId = new Map<number, AgentConfigurationData["profiles"][number]["runtimes"][number]["availableCapabilities"]>();
  if (options.registeredWorkspaceTools) {
    await Promise.all(profiles.map(async (profile) => {
      if (!profile.runtimeBindings.some((binding) => binding.runtimeKind === "workspace")) return;
      const capabilities = await listConfigurableWorkspaceCapabilities(
        profile.actorUserId,
        options.registeredWorkspaceTools ?? [],
      );
      workspaceCapabilitiesByProfileId.set(profile.id, capabilities.map((capability) => ({
        key: capability.key,
        label: capability.label,
        description: capability.description,
      })));
    }));
  }

  return {
    generatedAt: new Date().toISOString(),
    globalActionCeiling: systemConfig.agentAllowedActions,
    permissionResources,
    permissionLayers: [
      { key: "global", label: "全局动作上限", description: "控制 Agent 在全组织内最多可以使用哪些权限动作。", owner: "Agent" },
      { key: "runtime", label: "运行时能力", description: "每个运行时绑定只暴露声明过的能力与职责指令。", owner: "Agent" },
      { key: "requester", label: "请求人员工权限", description: "员工只能要求 Agent 处理本人本来就有权处理的业务。", owner: "业务 RBAC" },
      { key: "actor", label: "虚拟员工权限", description: "执行 Agent 自身的用户、岗位与部门权限也必须同时满足。", owner: "业务 RBAC" },
    ],
    profiles: profiles.map((profile) => {
      const employee = profile.actorUser.employees[0];
      const assignment = employee?.positions[0];
      return {
        id: profile.id,
        key: profile.key,
        displayName: profile.displayName,
        roleName: profile.roleName,
        responsibilities: profile.responsibilities,
        status: profile.status,
        actor: {
          username: profile.actorUser.username,
          employeeId: employee?.employeeId ?? profile.actorUser.employeeId,
          employeeName: employee?.name ?? null,
          departmentName: assignment?.department?.name ?? null,
          positionName: assignment?.position?.name ?? null,
          canLogin: profile.actorUser.canLogin,
        },
        runtimes: profile.runtimeBindings.map((binding) => {
          const capabilities = parseRuntimeCapabilities(binding.capabilityKeysJson);
          const kind = asRuntimeKind(binding.runtimeKind);
          const availableCapabilities = kind === "workspace"
            ? workspaceCapabilitiesByProfileId.get(profile.id) ?? []
            : [];
          const availableKeys = new Set(availableCapabilities.map((capability) => capability.key));
          return {
            id: binding.id,
            kind,
            status: binding.status,
            interactive: binding.interactive,
            capabilityKeys: capabilities.keys,
            availableCapabilities,
            instructions: binding.instructions,
            configurationValid: capabilities.valid
              && Boolean(binding.instructions.trim())
              && (kind !== "workspace" || capabilities.keys.every((key) => availableKeys.has(key))),
            receiptState: kind === "workspace" ? "workspace_audit" as const : "not_connected" as const,
          };
        }),
      };
    }),
  };
}
