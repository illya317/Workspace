import "server-only";

import { serviceError, serviceOk } from "../service-result";
import { NOTIFICATION_RECIPIENT_MAX_COUNT } from "./notification-definition-dsl";
import {
  listNotificationDefinitionManagementRows,
  listNotificationDefinitionLifecycleEvents,
  listNotificationChannelEndpointSummaries,
  listNotificationPublicationSummaries,
  listNotificationPublishingClients,
  listPublishedNotificationDefinitionConsoleRows,
  RECIPIENTS_PER_SOURCE_PER_MINUTE,
} from "./notification-publishing-storage";
import { evaluatePermissionAction } from "./rbac/action-grants";

export async function listNotificationPublishingConsoleData(userId: number) {
  const exactGrantOptions = {
    grantMatch: { action: "exact" as const, resource: "exact" as const },
  };
  const [canRead, canConfigure, canAudit] = await Promise.all([
    evaluatePermissionAction(userId, "settings.notifications", "read", exactGrantOptions),
    evaluatePermissionAction(userId, "settings.notifications", "configure", exactGrantOptions),
    evaluatePermissionAction(userId, "settings.notifications", "audit", exactGrantOptions),
  ]);
  if (!canRead) return serviceError("无权限", 403);

  const [definitions, clients, publications, channelEndpoints, lifecycleEvents] = await Promise.all([
    canConfigure
      ? listNotificationDefinitionManagementRows()
      : listPublishedNotificationDefinitionConsoleRows(),
    canConfigure ? listNotificationPublishingClients() : Promise.resolve([]),
    canAudit ? listNotificationPublicationSummaries() : Promise.resolve([]),
    canAudit ? listNotificationChannelEndpointSummaries() : Promise.resolve([]),
    canAudit ? listNotificationDefinitionLifecycleEvents() : Promise.resolve([]),
  ]);
  return serviceOk({
    definitions,
    clients,
    publications,
    channelEndpoints,
    lifecycleEvents,
    limits: {
      recipientsPerRequest: NOTIFICATION_RECIPIENT_MAX_COUNT,
      recipientsPerSourcePerMinute: RECIPIENTS_PER_SOURCE_PER_MINUTE,
    },
    canConfigure,
    canAudit,
  });
}
