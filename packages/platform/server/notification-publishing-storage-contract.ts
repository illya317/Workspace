import type {
  NotificationPublicationSource,
  NotificationResponseMode,
} from "./notification-definition-dsl";

export const RECIPIENTS_PER_SOURCE_PER_MINUTE = 500;

export type NotificationDefinitionDto = {
  id: number;
  key: string;
  label: string;
  description: string | null;
  titleTemplate: string;
  bodyTemplate: string;
  hrefTemplate: string | null;
  responseMode: NotificationResponseMode;
  isImportant: boolean;
  allowProjectMonitoring: boolean;
  variableKeys: string[];
  allowUserApi: boolean;
  allowedOpenApiClientIds: number[];
  status: "active" | "archived";
  revision: number;
  publishedRevision: number | null;
  version: number;
  hasDraft: boolean;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublishedNotificationDefinitionDto = {
  id: number;
  key: string;
  label: string;
  description: string | null;
  revision: number;
  variableKeys: string[];
  responseMode: NotificationResponseMode;
  isImportant: boolean;
  allowProjectMonitoring: boolean;
};

export type NotificationPublicationSummaryDto = {
  id: string;
  definitionKey: string;
  revision: number;
  sourceKind: NotificationPublicationSource["kind"];
  sourceId: string;
  sourceLabel: string;
  status: "committed" | "processing" | "partial" | "failed" | "delivered";
  recipientCount: number;
  deliveryCount: number;
  pendingDeliveryCount: number;
  deliveredDeliveryCount: number;
  failedDeliveryCount: number;
  createdAt: string;
};

export type NotificationPublishingClientDto = {
  id: number;
  name: string;
  status: string;
};

export type NotificationChannelEndpointSummaryDto = {
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

export type NotificationDefinitionLifecycleEventDto = {
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

export type PublishedDefinition = {
  id: number;
  key: string;
  revision: number;
  label: string;
  description: string | null;
  titleTemplate: string;
  bodyTemplate: string;
  hrefTemplate: string | null;
  responseMode: NotificationResponseMode;
  isImportant: boolean;
  allowProjectMonitoring: boolean;
  variableKeys: string[];
  allowUserApi: boolean;
  allowedOpenApiClientIds: number[];
};

export type NotificationDefinitionRow = {
  id: number;
  key: string;
  label: string;
  description: string | null;
  titleTemplate: string;
  bodyTemplate: string;
  hrefTemplate: string | null;
  responseMode: string;
  isImportant: boolean;
  allowProjectMonitoring: boolean;
  variableKeysJson: string;
  allowUserApi: boolean;
  allowedOpenApiClientIdsJson: string;
  status: string;
  revision: number;
  publishedRevision: number | null;
  version: number;
  publishedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toDefinitionDto(row: NotificationDefinitionRow): NotificationDefinitionDto {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    description: row.description,
    titleTemplate: row.titleTemplate,
    bodyTemplate: row.bodyTemplate,
    hrefTemplate: row.hrefTemplate,
    responseMode: responseMode(row.responseMode),
    isImportant: row.isImportant,
    allowProjectMonitoring: row.allowProjectMonitoring,
    variableKeys: parseStringArray(row.variableKeysJson),
    allowUserApi: row.allowUserApi,
    allowedOpenApiClientIds: parseNumberArray(row.allowedOpenApiClientIdsJson),
    status: row.status === "archived" ? "archived" : "active",
    revision: row.revision,
    publishedRevision: row.publishedRevision,
    version: row.version,
    hasDraft: row.publishedRevision !== row.revision,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toPublicationSummaryDto(row: {
  id: string;
  definitionKey: string;
  definitionRevision: number;
  sourceKind: string;
  sourceId: string;
  sourceLabel: string;
  status: string;
  recipientCount: number;
  deliveryCount: number;
  pendingDeliveryCount: number;
  deliveredDeliveryCount: number;
  failedDeliveryCount: number;
  createdAt: Date;
}): NotificationPublicationSummaryDto {
  return {
    id: row.id,
    definitionKey: row.definitionKey,
    revision: row.definitionRevision,
    sourceKind: row.sourceKind === "user-api" ? "user-api" : row.sourceKind === "open-api" ? "open-api" : "internal",
    sourceId: row.sourceId,
    sourceLabel: row.sourceLabel,
    status: notificationPublicationStatus(row.status),
    recipientCount: row.recipientCount,
    deliveryCount: row.deliveryCount,
    pendingDeliveryCount: row.pendingDeliveryCount,
    deliveredDeliveryCount: row.deliveredDeliveryCount,
    failedDeliveryCount: row.failedDeliveryCount,
    createdAt: row.createdAt.toISOString(),
  };
}

export function responseMode(value: string): NotificationResponseMode {
  return value === "acknowledge" ? "acknowledge" : "read";
}

export function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function parseNumberArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is number => Number.isInteger(item) && item > 0) : [];
  } catch {
    return [];
  }
}

function notificationPublicationStatus(value: string): NotificationPublicationSummaryDto["status"] {
  return value === "processing" || value === "partial" || value === "failed" || value === "delivered"
    ? value
    : "committed";
}
