import type { ApiMethod } from "./api-contract-types";

const PERMISSION_ONLY = { eligibility: "permission_only" } as const;

const AGENT_CONFIG = {
  moduleKey: "agent",
  resourceKey: "agent.config",
  originHrefPattern: "/agent/config",
} as const;

const AGENT_SOURCE = {
  moduleKey: "agent",
  resourceKey: "agent.source",
} as const;

function route(method: ApiMethod, path: string, notes?: string) {
  return notes ? { method, path, notes } : { method, path };
}

export const AGENT_BUSINESS_ACTION_REGISTRATIONS = [
  {
    ...AGENT_CONFIG,
    ...PERMISSION_ONLY,
    key: "agent.config.save",
    label: "保存 Agent 配置",
    writeKind: "system",
    targetKind: "AgentProfile",
    directPermissionAction: "configure",
    apiRoutes: [route("PUT", "/api/modules/agent/config")],
    notes: "配置可修改 Agent 档案与一个既有运行时绑定；actor、profile key、runtime kind 和组织 RBAC grant 均不可通过该动作修改。",
  },
  {
    ...AGENT_CONFIG,
    ...PERMISSION_ONLY,
    key: "agent.config.actionCeiling.configure",
    label: "配置 Agent 全局动作上限",
    writeKind: "system",
    targetKind: "SystemConfig",
    directPermissionAction: "configure",
    apiRoutes: [route("PUT", "/api/modules/agent/config/action-ceiling")],
    notes: "动作上限只会收窄 Agent 可执行动作，不会创建或扩大任何用户、岗位、部门的组织 RBAC 授权。",
  },
  {
    ...AGENT_SOURCE,
    ...PERMISSION_ONLY,
    key: "source.submitCnbPullRequest",
    label: "提交 CNB Pull Request",
    writeKind: "submit",
    targetKind: "CnbPullRequest",
    directPermissionAction: "submit",
    apiRoutes: [route(
      "POST",
      "/api/agent/proposals/:id/confirm",
      "通用提案确认路由按 AgentProposal.actionKey 分发到 CNB executor，并在执行前重新校验请求人与虚拟员工权限。",
    )],
    notes: "CNB 是权威远端状态；Workspace 只持久化 AgentProposal 请求、执行状态与结果审计，不把远端 PR 伪装成本地业务记录。",
  },
] as const;
