import type { ApiMethod } from "./api-contract-types";

const PERMISSION_ONLY = { eligibility: "permission_only" } as const;

const AGENT_SOURCE = {
  moduleKey: "agent",
  resourceKey: "agent.source",
} as const;

function route(method: ApiMethod, path: string, notes?: string) {
  return notes ? { method, path, notes } : { method, path };
}

export const AGENT_BUSINESS_ACTION_REGISTRATIONS = [
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
