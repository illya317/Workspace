export type AgentManagementRuntimeKind = "workspace" | "codex_local" | "ci" | "server_ops";

export type AgentConfigurationCapabilityOption = {
  key: string;
  label: string;
  description: string;
};

export type AgentPermissionResourceItem = {
  key: string;
  name: string;
  grantManageable: boolean;
};

export type AgentConfigurationRuntimeItem = {
  id: number;
  kind: AgentManagementRuntimeKind;
  status: string;
  interactive: boolean;
  capabilityKeys: string[];
  availableCapabilities: AgentConfigurationCapabilityOption[];
  instructions: string;
  configurationValid: boolean;
  receiptState: "workspace_audit" | "not_connected";
};

export type AgentConfigurationProfileItem = {
  id: number;
  key: string;
  displayName: string;
  roleName: string;
  responsibilities: string;
  status: string;
  actor: {
    username: string;
    employeeId: string | null;
    employeeName: string | null;
    departmentName: string | null;
    positionName: string | null;
    canLogin: boolean;
  };
  runtimes: AgentConfigurationRuntimeItem[];
};

export type AgentConfigurationData = {
  generatedAt: string;
  profiles: AgentConfigurationProfileItem[];
  globalActionCeiling: string[];
  permissionResources: AgentPermissionResourceItem[];
  permissionLayers: Array<{
    key: "global" | "runtime" | "requester" | "actor";
    label: string;
    description: string;
    owner: "Agent" | "业务 RBAC";
  }>;
};

export type AgentConfigurationUpdateResult = {
  profile: {
    id: number;
    displayName: string;
    roleName: string;
    responsibilities: string;
    status: string;
    updatedAt: string;
  } | null;
  runtime: {
    id: number;
    status: string;
    interactive: boolean;
    instructions: string;
    capabilityKeys: string[];
    updatedAt: string;
  } | null;
};

export type AgentManagementPeriod = {
  from: string;
  to: string;
  label: string;
};

export type AgentUsageMetrics = {
  runCount: number;
  sessionCount: number;
  employeeCount: number;
  runningCount: number;
  succeededCount: number;
  failedCount: number;
  abortedCount: number;
  tokenCapturedRunCount: number;
  inputOtherTokens: number;
  inputCacheReadTokens: number;
  inputCacheCreationTokens: number;
  outputTokens: number;
  contextUsagePeak: number | null;
};

export type AgentEmployeeUsageItem = {
  userId: number;
  employeeId: string | null;
  employeeName: string;
  departmentName: string | null;
  runCount: number;
  sessionCount: number;
  succeededCount: number;
  failedCount: number;
  capturedRunCount: number;
  totalTokens: number | null;
  lastUsedAt: string | null;
};

export type AgentTokenUsageItem = {
  key: string;
  agentName: string;
  runCount: number;
  capturedRunCount: number;
  inputOtherTokens: number;
  inputCacheReadTokens: number;
  inputCacheCreationTokens: number;
  outputTokens: number;
  contextUsagePeak: number | null;
};

export type AgentUsageSessionItem = {
  id: string;
  title: string;
  contextLabel: string | null;
  pagePath: string | null;
  summaryShort: string | null;
  employeeName: string;
  agentName: string;
  runCount: number;
  capturedRunCount: number;
  status: "running" | "completed" | "awaiting_confirmation" | "awaiting_input" | "failed" | "aborted";
  totalTokens: number | null;
  lastUsedAt: string;
};

export type AgentUsageData = {
  generatedAt: string;
  period: AgentManagementPeriod;
  canAudit: boolean;
  metrics: AgentUsageMetrics;
  employees: AgentEmployeeUsageItem[];
  tokenUsage: AgentTokenUsageItem[];
  sessions: AgentUsageSessionItem[];
};

export type AgentReportStatus = "running" | "completed" | "awaiting_confirmation" | "awaiting_input" | "failed" | "aborted";

export type AgentReportProfileItem = {
  key: string;
  agentName: string;
  roleName: string;
  runtimeKinds: AgentManagementRuntimeKind[];
  configuredRuntimeCount: number;
  unreportedRuntimeCount: number;
  sessionCount: number;
  runCount: number;
  completedCount: number;
  awaitingConfirmationCount: number;
  awaitingInputCount: number;
  exceptionCount: number;
  lastRunAt: string | null;
};

export type AgentRunReportItem = {
  sessionId: string;
  title: string;
  contextLabel: string | null;
  pagePath: string | null;
  summaryShort: string | null;
  employeeName: string;
  agentName: string;
  runtimeKind: AgentManagementRuntimeKind;
  /** Current session responsibility after merging live proposals. */
  status: AgentReportStatus;
  /** Terminal meaning of the latest run, kept separate so active work cannot hide an exception. */
  latestRunStatus: AgentReportStatus;
  runCount: number;
  latestResultType: string | null;
  latestToolKey: string | null;
  latestErrorMessage: string | null;
  proposalCount: number;
  startedAt: string;
  lastRunAt: string;
};

export type AgentExternalReceiptItem = {
  key: string;
  agentName: string;
  roleName: string;
  runtimeKind: Exclude<AgentManagementRuntimeKind, "workspace">;
  bindingStatus: string;
  receiptState: "not_connected";
};

export type AgentReportsData = {
  generatedAt: string;
  period: AgentManagementPeriod;
  canAudit: boolean;
  metrics: {
    sessionCount: number;
    runningCount: number;
    completedCount: number;
    awaitingConfirmationCount: number;
    awaitingInputCount: number;
    exceptionCount: number;
    externalBindingCount: number;
  };
  profiles: AgentReportProfileItem[];
  reports: AgentRunReportItem[];
  externalReceipts: AgentExternalReceiptItem[];
};
