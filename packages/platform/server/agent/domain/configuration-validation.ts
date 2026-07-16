import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

import type { AgentRuntimeKind } from "../runtime-binding";

export type AgentConfigurationStatus = "active" | "suspended";

export type AgentConfigurationUpdateInput = {
  editorUserId: number;
  profileId: number;
  profile?: {
    displayName: string;
    roleName: string;
    responsibilities: string;
    status: AgentConfigurationStatus;
  };
  runtime?: {
    id: number;
    status: AgentConfigurationStatus;
    interactive: boolean;
    instructions: string;
    capabilityKeys: string[];
  };
};

export type AgentConfigurationValidationContext = {
  profileId: number;
  runtime: {
    id: number;
    agentProfileId: number;
    runtimeKind: AgentRuntimeKind;
  } | null;
  availableWorkspaceCapabilityKeys: readonly string[];
};

export type AgentConfigurationUpdateCommand = {
  editorUserId: number;
  profileId: number;
  profile: AgentConfigurationUpdateInput["profile"] | null;
  runtime: ({
    runtimeKind: AgentRuntimeKind;
  } & NonNullable<AgentConfigurationUpdateInput["runtime"]>) | null;
};

const EXTERNAL_CAPABILITY_KEY = /^[a-z][a-z0-9]*(?:[._:-][a-z0-9][a-z0-9_-]*)+$/;

function normalizeRequiredText(value: string, field: string, label: string) {
  const normalized = value.trim();
  return normalized
    ? okCommand(normalized)
    : failCommand(`${label}不能为空`, 400, field);
}

function normalizeCapabilityKeys(keys: readonly string[]) {
  return [...new Set(keys.map((key) => key.trim()).filter(Boolean))];
}

export function validateAgentConfigurationUpdate(
  input: AgentConfigurationUpdateInput,
  context: AgentConfigurationValidationContext,
): DomainValidationResult<AgentConfigurationUpdateCommand> {
  if (!Number.isInteger(input.editorUserId) || input.editorUserId <= 0) {
    return failCommand("配置编辑人无效", 400, "editorUserId");
  }
  if (input.profileId !== context.profileId) {
    return failCommand("Agent 档案不存在", 404, "profileId");
  }
  if (!input.profile && !input.runtime) {
    return failCommand("至少需要修改 Agent 档案或一个运行时绑定", 400);
  }

  let profile: AgentConfigurationUpdateCommand["profile"] = null;
  if (input.profile) {
    const displayName = normalizeRequiredText(input.profile.displayName, "profile.displayName", "Agent 名称");
    if (!displayName.ok) return displayName;
    const roleName = normalizeRequiredText(input.profile.roleName, "profile.roleName", "岗位名称");
    if (!roleName.ok) return roleName;
    const responsibilities = normalizeRequiredText(
      input.profile.responsibilities,
      "profile.responsibilities",
      "职责说明",
    );
    if (!responsibilities.ok) return responsibilities;
    profile = {
      displayName: displayName.data,
      roleName: roleName.data,
      responsibilities: responsibilities.data,
      status: input.profile.status,
    };
  }

  let runtime: AgentConfigurationUpdateCommand["runtime"] = null;
  if (input.runtime) {
    if (!context.runtime || context.runtime.id !== input.runtime.id) {
      return failCommand("运行时绑定不存在", 404, "runtime.id");
    }
    if (context.runtime.agentProfileId !== input.profileId) {
      return failCommand("运行时绑定不属于该 Agent 档案", 409, "runtime.id");
    }
    const instructions = normalizeRequiredText(
      input.runtime.instructions,
      "runtime.instructions",
      "运行时职责指令",
    );
    if (!instructions.ok) return instructions;
    const capabilityKeys = normalizeCapabilityKeys(input.runtime.capabilityKeys);
    if (capabilityKeys.length > 100) {
      return failCommand("运行时能力不能超过 100 项", 400, "runtime.capabilityKeys");
    }

    if (context.runtime.runtimeKind === "workspace") {
      const available = new Set(context.availableWorkspaceCapabilityKeys);
      const unknown = capabilityKeys.find((key) => !available.has(key));
      if (unknown) {
        return failCommand(
          `Workspace 运行时能力未注册或虚拟员工无权使用：${unknown}`,
          400,
          "runtime.capabilityKeys",
        );
      }
    } else {
      const malformed = capabilityKeys.find((key) => !EXTERNAL_CAPABILITY_KEY.test(key));
      if (malformed) {
        return failCommand(`外部运行时能力 key 格式无效：${malformed}`, 400, "runtime.capabilityKeys");
      }
    }

    runtime = {
      id: input.runtime.id,
      runtimeKind: context.runtime.runtimeKind,
      status: input.runtime.status,
      interactive: input.runtime.interactive,
      instructions: instructions.data,
      capabilityKeys,
    };
  }

  return okCommand({
    editorUserId: input.editorUserId,
    profileId: input.profileId,
    profile,
    runtime,
  });
}
