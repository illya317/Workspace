import { workspacePath } from "@workspace/core/routing";

export type NotificationResponseMode = "read" | "acknowledge";

export type NotificationDefinitionWorkbenchRow = {
  id: number;
  key: string;
  label: string;
  description: string | null;
  status: "active" | "archived";
  revision: number;
  publishedRevision: number | null;
  version: number;
  hasDraft: boolean;
  titleTemplate: string;
  bodyTemplate: string;
  hrefTemplate: string | null;
  responseMode: NotificationResponseMode;
  isImportant: boolean;
  allowUserApi: boolean;
  allowProjectMonitoring: boolean;
  allowedOpenApiClientIds: number[];
};

export type NotificationApiClientRow = { id: number; name: string; status: string };

export type NotificationPublicationStatus =
  | "committed"
  | "processing"
  | "partial"
  | "failed"
  | "delivered";

export type NotificationPublicationRow = {
  id: string;
  definitionKey: string;
  revision: number;
  sourceKind: string;
  sourceId: string | null;
  sourceLabel: string;
  status: NotificationPublicationStatus;
  recipientCount: number;
  deliveryCount: number;
  pendingDeliveryCount: number;
  deliveredDeliveryCount: number;
  failedDeliveryCount: number;
  createdAt: string;
};

export type NotificationChannelEndpointRow = {
  key: string;
  channel: string;
  label: string;
  status: string;
  healthStatus: string;
  lastHeartbeatAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastErrorCode: string | null;
  lastErrorSummary: string | null;
  deliveryCount: number;
  pendingDeliveryCount: number;
  deliveredDeliveryCount: number;
  failedDeliveryCount: number;
};

export type NotificationDefinitionLifecycleAction =
  | "created"
  | "saved"
  | "published"
  | "archived";

export type NotificationDefinitionLifecycleEventRow = {
  id: string;
  definitionId: number;
  definitionKey: string;
  definitionLabel: string;
  revision: number;
  action: NotificationDefinitionLifecycleAction;
  actorUserId: number;
  actorUsername: string;
  occurredAt: string;
  priorVersion: number;
  newVersion: number;
};

export type NotificationPublishingWorkbenchResponse = {
  definitions: NotificationDefinitionWorkbenchRow[];
  clients: NotificationApiClientRow[];
  publications: NotificationPublicationRow[];
  channelEndpoints: NotificationChannelEndpointRow[];
  lifecycleEvents: NotificationDefinitionLifecycleEventRow[];
  canConfigure: boolean;
  canAudit: boolean;
};

export type NotificationDefinitionDraft = {
  key: string;
  label: string;
  description: string;
  titleTemplate: string;
  bodyTemplate: string;
  hrefTemplate: string;
  responseMode: NotificationResponseMode;
  isImportant: boolean;
  allowUserApi: boolean;
  allowProjectMonitoring: boolean;
  allowedOpenApiClientIds: number[];
};

export const EMPTY_NOTIFICATION_DEFINITION_DRAFT: NotificationDefinitionDraft = {
  key: "",
  label: "",
  description: "",
  titleTemplate: "",
  bodyTemplate: "",
  hrefTemplate: "",
  responseMode: "read",
  isImportant: false,
  allowUserApi: false,
  allowProjectMonitoring: false,
  allowedOpenApiClientIds: [],
};

export function toNotificationDefinitionDraft(
  item: NotificationDefinitionWorkbenchRow,
): NotificationDefinitionDraft {
  return {
    key: item.key,
    label: item.label,
    description: item.description ?? "",
    titleTemplate: item.titleTemplate,
    bodyTemplate: item.bodyTemplate,
    hrefTemplate: item.hrefTemplate ?? "",
    responseMode: item.responseMode,
    isImportant: item.isImportant,
    allowUserApi: item.allowUserApi,
    allowProjectMonitoring: item.allowProjectMonitoring,
    allowedOpenApiClientIds: item.allowedOpenApiClientIds,
  };
}

export function extractNotificationVariableKeys(...templates: string[]) {
  const keys = new Set<string>();
  for (const template of templates) {
    for (const match of template.matchAll(/\{\{([a-z][a-z0-9_]*)\}\}/g)) {
      keys.add(match[1]!);
    }
  }
  return [...keys].sort();
}

export function renderNotificationTemplatePreview(template: string, keys: string[]) {
  const values = new Map(keys.map((key) => [key, `示例_${key}`]));
  return template.replace(
    /\{\{([a-z][a-z0-9_]*)\}\}/g,
    (_match, key: string) => values.get(key) ?? "",
  );
}

export function notificationDefinitionState(item: NotificationDefinitionWorkbenchRow) {
  if (item.status === "archived") return { label: "已归档", tone: "muted" as const };
  if (item.publishedRevision !== null && item.hasDraft) {
    return { label: "有待发布改动", tone: "warning" as const };
  }
  if (item.publishedRevision !== null) return { label: "已发布", tone: "success" as const };
  return { label: "草稿", tone: "warning" as const };
}

export function notificationPublicationStatusView(status: NotificationPublicationStatus) {
  if (status === "delivered") return { label: "已送达", tone: "green" as const };
  if (status === "processing") return { label: "投递中", tone: "blue" as const };
  if (status === "partial") return { label: "部分成功", tone: "amber" as const };
  if (status === "failed") return { label: "投递失败", tone: "red" as const };
  return { label: "已提交", tone: "slate" as const };
}

export function notificationDefinitionLifecycleActionView(
  action: NotificationDefinitionLifecycleAction,
) {
  if (action === "created") return { label: "已创建", tone: "blue" as const };
  if (action === "saved") return { label: "草稿已保存", tone: "slate" as const };
  if (action === "published") return { label: "已发布", tone: "green" as const };
  return { label: "已归档", tone: "slate" as const };
}

export function notificationChannelHealthView(
  input: Pick<NotificationChannelEndpointRow, "status" | "healthStatus">,
) {
  if (input.status !== "active") return { label: "已停用", tone: "slate" as const };
  if (input.healthStatus === "healthy") return { label: "运行正常", tone: "green" as const };
  if (input.healthStatus === "degraded") return { label: "运行降级", tone: "amber" as const };
  if (input.healthStatus === "failing") return { label: "投递异常", tone: "red" as const };
  if (input.healthStatus === "disconnected") return { label: "连接断开", tone: "red" as const };
  return { label: "状态未知", tone: "slate" as const };
}

export function notificationDeliveryCountLabel(input: {
  deliveredDeliveryCount: number;
  pendingDeliveryCount: number;
  failedDeliveryCount: number;
}) {
  return `已送达 ${input.deliveredDeliveryCount} · 待处理 ${input.pendingDeliveryCount} · 失败 ${input.failedDeliveryCount}`;
}

export function formatNotificationConsoleDate(value: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-";
}

export function notificationPublicationCurlExample(
  draft: NotificationDefinitionDraft,
  keys: string[],
) {
  const origin = "https://your-workspace.example";
  return [
    `curl --request POST '${origin}${workspacePath("/api/open/v1/notifications/publications")}' \\`,
    "  --header 'Authorization: Bearer <client-secret>' \\",
    "  --header 'Idempotency-Key: <unique-request-id>' \\",
    "  --header 'Content-Type: application/json' \\",
    `  --data '${JSON.stringify({
      definitionKey: draft.key || "custom.operations.shipment_delayed",
      usernames: ["username"],
      variables: Object.fromEntries(keys.map((key) => [key, `value_for_${key}`])),
    })}'`,
  ].join("\n");
}
