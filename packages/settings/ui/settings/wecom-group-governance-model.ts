export type ManagedGroupStatus = "discovered" | "unclaimed" | "active" | "suspended";
export type ManagedGroupVerificationStatus = "pending" | "verified" | "failed";

export type ManagedWeComGroupRow = {
  id: number;
  groupKey: string;
  displayName: string | null;
  status: ManagedGroupStatus;
  ownerUser: { id: number; username: string | null; displayName: string | null } | null;
  ownerPosition: { id: number; name: string | null } | null;
  discoveredAt: string;
  lastSeenAt: string;
  lastVerifiedAt: string | null;
  verificationStatus: ManagedGroupVerificationStatus;
  version: number;
};

export type NotificationGroupDataScope = {
  type: "workspace" | "departments" | "projects" | "users";
  ids: string[];
  label: string;
};

export type NotificationGroupSchedule =
  | { mode: "manual" }
  | { mode: "weekly"; timezone: "Asia/Shanghai"; weekday: number; time: string };

export type NotificationGroupPolicyRow = {
  id: string;
  key: string;
  groupId: number;
  groupKey: string;
  groupDisplayName: string | null;
  definitionKey: string;
  label: string;
  dataScope: NotificationGroupDataScope;
  schedule: NotificationGroupSchedule;
  messageTemplate: string | null;
  enabled: boolean;
  weeklyAgentBinding: { agentKey: string; label: string; triggerMode: "api" } | null;
  lastDelivery: { id: number; status: string | null; createdAt: string | null } | null;
  lastFailure: { failedAt: string; code: string | null; summary: string | null } | null;
  version: number;
  updatedAt: string;
};

export type GroupPolicyDraft = {
  key: string;
  label: string;
  definitionKey: string;
  scopeType: "workspace" | "departments" | "projects" | "users";
  scopeIds: string[];
  scheduleMode: "manual" | "weekly";
  weekday: number;
  time: string;
  messageTemplate: string;
  bindWeeklyAgent: boolean;
  enabled: boolean;
};

export function emptyGroupPolicyDraft(messageTemplate = ""): GroupPolicyDraft {
  return {
    key: "", label: "", definitionKey: "", scopeType: "workspace", scopeIds: [],
    scheduleMode: "manual", weekday: 5, time: "17:30", messageTemplate,
    bindWeeklyAgent: false, enabled: false,
  };
}

export type NotificationGroupDeliveryRow = {
  id: number;
  publicationId: string;
  policyId: string;
  groupKey: string;
  groupDisplayName: string | null;
  status: string;
  attemptCount: number;
  createdAt: string;
  deliveredAt: string | null;
  failedAt: string | null;
  error: { code: string; summary: string | null } | null;
};

export type GroupGovernanceOption = { id: number; label: string; description?: string | null };
export type GroupDataScopeOption = { id: string; label: string; description?: string | null };
export type NotificationDefinitionOption = { key: string; label: string; revision: number };

export type WeComGroupGovernanceResponse = {
  managedGroups: ManagedWeComGroupRow[];
  groupPolicies: NotificationGroupPolicyRow[];
  weeklyAgentOptions: Array<{
    key: "work.weekly-report";
    label: string;
    status: string;
    triggerMode: "api";
    publicationRoute: string;
    supportedScheduleModes: Array<"manual" | "weekly">;
    defaultMessageTemplate: string;
    messageRuleSummary: string;
    messageVariables: Array<{ key: string; label: string }>;
  }>;
  ownerUserOptions?: GroupGovernanceOption[];
  ownerPositionOptions?: GroupGovernanceOption[];
  definitionOptions?: NotificationDefinitionOption[];
  dataScopeOptions?: {
    departments: GroupDataScopeOption[];
    projects: GroupDataScopeOption[];
    users: GroupDataScopeOption[];
  };
  recentDeliveries: NotificationGroupDeliveryRow[];
  canConfigure: boolean;
  canAudit: boolean;
};

type ManagedGroupGovernanceState = Pick<
  ManagedWeComGroupRow,
  "displayName" | "ownerUser" | "ownerPosition" | "verificationStatus" | "status"
>;

export function isManagedGroupClaimed(group: ManagedGroupGovernanceState | null) {
  return Boolean(group?.displayName?.trim() && (group.ownerUser || group.ownerPosition));
}

export function isManagedGroupReadyForPolicy(group: ManagedGroupGovernanceState | null) {
  return Boolean(
    group
    && isManagedGroupClaimed(group)
    && group.verificationStatus === "verified"
    && group.status === "active",
  );
}

export function managedGroupGovernanceStage(group: ManagedGroupGovernanceState | null) {
  if (!group) return "先从受管群目录选择一个群";
  if (!isManagedGroupClaimed(group)) return "待认领：命名并指定负责人";
  if (group.verificationStatus !== "verified") return "已认领：等待验证 Bot 在群";
  if (group.status !== "active") return "已验证：群当前停用";
  return "已就绪：配置每群策略与周报绑定";
}

export function managedGroupStatusView(status: ManagedGroupStatus) {
  if (status === "active") return { label: "已启用", tone: "success" as const };
  if (status === "suspended") return { label: "已停用", tone: "danger" as const };
  if (status === "unclaimed") return { label: "待验证", tone: "warning" as const };
  return { label: "待认领", tone: "warning" as const };
}

export function managedGroupVerificationView(status: ManagedGroupVerificationStatus) {
  if (status === "verified") return { label: "验证通过", tone: "success" as const };
  if (status === "failed") return { label: "验证失败", tone: "danger" as const };
  return { label: "待验证", tone: "warning" as const };
}

export function groupPolicyScheduleLabel(schedule: NotificationGroupSchedule) {
  if (schedule.mode === "manual") return "手动触发";
  const weekdays = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  return `${weekdays[schedule.weekday] ?? `星期 ${schedule.weekday}`} ${schedule.time}`;
}

export function groupPolicyDeliveryView(policy: NotificationGroupPolicyRow) {
  if (
    policy.lastFailure
    && (!policy.lastDelivery?.createdAt || policy.lastFailure.failedAt >= policy.lastDelivery.createdAt)
  ) return { label: "最近失败", tone: "red" as const };
  if (!policy.lastDelivery) return { label: "尚未投递", tone: "slate" as const };
  if (policy.lastDelivery.status === "delivered") return { label: "最近成功", tone: "green" as const };
  return { label: policy.lastDelivery.status ?? "处理中", tone: "amber" as const };
}
