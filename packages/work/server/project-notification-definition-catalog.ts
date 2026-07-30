import "server-only";

import { listPublishedNotificationDefinitionsForSource } from "@workspace/platform/server/notification-publishing";

export const PROJECT_NOTIFICATION_VARIABLE_KEYS = [
  "project_id",
  "project_code",
  "project_name",
  "project_status",
  "project_level",
  "project_completion_percent",
  "project_planned_start_date",
  "project_planned_end_date",
  "project_risk_present",
  "project_is_archived",
  "signal_kind",
  "signal_changed_field",
] as const;

const PROJECT_NOTIFICATION_VARIABLE_KEY_SET = new Set<string>(PROJECT_NOTIFICATION_VARIABLE_KEYS);

export function projectNotificationPublicationSource(projectId: number) {
  return {
    kind: "internal" as const,
    id: `work.project-notification:${projectId}`,
    label: "Work 项目通知监管",
  };
}

export async function listCompatibleDefinitions(projectId: number) {
  const definitions = await listPublishedNotificationDefinitionsForSource(
    projectNotificationPublicationSource(projectId),
  );
  return definitions.filter((definition) => (
    definition.key.startsWith("custom.")
    && definition.allowProjectMonitoring === true
    && definition.variableKeys.every((key) => PROJECT_NOTIFICATION_VARIABLE_KEY_SET.has(key))
  ));
}

export async function findCompatibleDefinition(projectId: number, definitionKey: string) {
  return (await listCompatibleDefinitions(projectId))
    .find((definition) => definition.key === definitionKey) ?? null;
}
