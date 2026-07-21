export const LOCK_NAME = "workspace:agent-workforce:v1";
export const DEPARTMENT = { code: "FUN103", name: "IT事务部" };
export const PARENT_POSITION = { code: "GW-FUN103-01", name: "IT总监" };
export const AGENT_RESOURCE_KEY = "agent.assistant";
export const MANAGED_WORKSPACE_RESOURCE_GRANTS = [
  { resourceKey: "agent.assistant", actions: ["entry", "read", "submit"] },
  { resourceKey: "agent.source", actions: ["read", "submit"] },
  { resourceKey: "docs.editor", actions: ["entry"] },
];
export const VIRTUAL_PERSONNEL_TYPE = "虚拟员工";
export const PROVISIONER_LEDGER_SOURCE = "agent_workforce_provisioner";
export const AGENT_BUSINESS_TIME_ZONE = "Asia/Shanghai";

const agentBusinessDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: AGENT_BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function agentBusinessDate(value) {
  const parts = agentBusinessDateFormatter.formatToParts(value);
  const read = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

export function isAgentDateTimeEndActive(endDate, today) {
  if (!endDate) return true;
  const value = endDate instanceof Date ? endDate : new Date(endDate);
  return !Number.isNaN(value.getTime()) && agentBusinessDate(value) >= today;
}

export function isProvisionerCreatedGrantLedgerEvent(event) {
  return event?.source === PROVISIONER_LEDGER_SOURCE
    && event.eventType === "grant"
    && event.afterValue === true;
}

const WORKSPACE_TOOL_KEYS = [
  "source.searchWorkspaceCode",
  "source.proposePullRequest",
  "docs.searchQcTemplates",
  "docs.inspectQcTemplate",
  "docs.updateQcTemplate",
  "docs.publishQcTemplate",
];

export const WORKFORCE = [
  {
    employeeId: "AI0001",
    displayName: "研发架构 Agent",
    username: "agent-dev-architect",
    profileKey: "development.architecture",
    roleName: "AI研发与系统架构专员",
    positionCode: "GW-FUN103-04",
    responsibilities: "负责需求分析、系统架构设计、代码实现、架构边界维护与变更提案。",
    workspaceResourceGrants: [],
    legacyAllowedToolKeys: [],
    runtimeBindings: [{
      runtimeKind: "codex_local",
      interactive: false,
      capabilityKeys: ["source.searchWorkspaceCode", "source.proposePullRequest", "code.write", "test.run", "git.commit"],
      instructions: "在本地 Codex 任务中承担架构设计与代码开发；遵守仓库边界、人工授权和提交范围，不在 Workspace 对话界面执行。",
    }],
  },
  {
    employeeId: "AI0002",
    displayName: "测试审查 Agent",
    username: "agent-qa-review",
    profileKey: "development.quality",
    roleName: "AI测试与代码审查员",
    positionCode: "GW-FUN103-05",
    responsibilities: "负责测试设计、回归验证、代码审查、缺陷发现与质量门禁建议。",
    workspaceResourceGrants: [],
    legacyAllowedToolKeys: [],
    runtimeBindings: [
      {
        runtimeKind: "codex_local",
        interactive: false,
        capabilityKeys: ["source.searchWorkspaceCode", "source.proposePullRequest", "code.review", "test.run"],
        instructions: "在本地 Codex 任务中承担测试设计、代码审查与回归验证；输出发现和验证证据，不在 Workspace 对话界面执行。",
      },
      {
        runtimeKind: "ci",
        interactive: false,
        capabilityKeys: ["code.review", "test.run", "quality.gate"],
        instructions: "在 CI 运行时执行自动化检查与质量门禁；仅产生检查结果和审查证据，不在 Workspace 对话界面执行。",
      },
    ],
  },
  {
    employeeId: "AI0003",
    displayName: "发布运维 Agent",
    username: "agent-release-ops",
    profileKey: "development.operations",
    roleName: "AI发布运维专员",
    positionCode: "GW-FUN103-06",
    responsibilities: "负责发布准备、部署校验、运行态检查、回滚方案与运维提案。",
    workspaceResourceGrants: [],
    legacyAllowedToolKeys: [],
    runtimeBindings: [{
      runtimeKind: "server_ops",
      interactive: false,
      capabilityKeys: ["release.prepare", "deploy.execute", "runtime.verify", "rollback.propose"],
      instructions: "在受控服务器运维任务中承担发布、部署与运行态验证；遵循部署门禁和人工授权，不在 Workspace 对话界面执行。",
    }],
  },
  {
    employeeId: "AI0004",
    displayName: "Workspace 提案助理",
    username: "agent-workspace-assistant",
    profileKey: "workspace.business-assistant",
    roleName: "AI查询与业务处理助理",
    positionCode: "GW-FUN103-07",
    responsibilities: "负责 Workspace 内已接入能力的查询、受控变更提案，以及按双方实时权限直接处理 QC 官方模板；不承担本地代码开发、直接提交或部署。",
    workspaceResourceGrants: MANAGED_WORKSPACE_RESOURCE_GRANTS,
    legacyAllowedToolKeys: WORKSPACE_TOOL_KEYS,
    runtimeBindings: [{
      runtimeKind: "workspace",
      interactive: true,
      capabilityKeys: WORKSPACE_TOOL_KEYS,
      instructions: "仅在 Workspace 页面助手中按请求人与本虚拟员工权限交集执行。源码变更必须先形成 PR 提案并由请求人确认；QC 官方模板可按 direct tool contract 直接保存或发布，但仍须通过双方空间权限、版本和领域校验。不承担本地代码开发、直接提交或部署。",
    }],
  },
];
