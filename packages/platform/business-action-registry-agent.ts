import type { ApiMethod } from "./api-contract-types";

const PERMISSION_ONLY = { eligibility: "permission_only" } as const;

const AGENT_ASSISTANT = {
  moduleKey: "agent",
  resourceKey: "agent.assistant",
} as const;

function route(method: ApiMethod, path: string, notes?: string) {
  return notes ? { method, path, notes } : { method, path };
}

export const AGENT_BUSINESS_ACTION_REGISTRATIONS = [
  {
    ...AGENT_ASSISTANT,
    ...PERMISSION_ONLY,
    key: "agent.businessApi.mutation.execute",
    label: "确认执行 Agent 业务 API 写入",
    writeKind: "submit",
    targetKind: "WorkspaceBusinessApi",
    directPermissionAction: "submit",
    apiRoutes: [route(
      "POST",
      "/api/agent/proposals/:id/confirm",
      "确认路由只执行提案中已冻结且仍命中 registry 的标准业务 API 请求，并实时复核请求人、虚拟员工与 Agent 动作上限。",
    )],
    notes: "AgentProposal 只承担会话确认和执行审计；真正的业务校验、对象授权与持久化仍由目标 /api/modules/** route 和 owning service 完成。",
  },
] as const;
