import assert from "node:assert/strict";

import { prisma, Prisma } from "@workspace/platform/server/prisma";

const EXPECTED_TRIGGERS = new Map<string, readonly string[]>([
  ["NotificationDefinition", [
    "NotificationDefinition_key_immutable",
    "NotificationDefinition_stable_identity",
  ]],
  ["NotificationPublication", [
    "NotificationPublication_frozen_columns",
    "NotificationPublication_no_delete",
    "NotificationPublication_no_truncate",
  ]],
  ["NotificationDelivery", [
    "NotificationDelivery_frozen_columns",
    "NotificationDelivery_no_delete",
    "NotificationDelivery_no_truncate",
  ]],
  ["NotificationDefinitionRevision", [
    "NotificationDefinitionRevision_append_only",
    "NotificationDefinitionRevision_no_truncate",
  ]],
  ["NotificationDefinitionLifecycleEvent", [
    "NotificationDefinitionLifecycleEvent_append_only",
    "NotificationDefinitionLifecycleEvent_no_truncate",
  ]],
  ["NotificationDeliveryAttempt", [
    "NotificationDeliveryAttempt_append_only",
    "NotificationDeliveryAttempt_no_truncate",
  ]],
  ["ProjectNotificationRuleRevision", [
    "ProjectNotificationRuleRevision_append_only",
    "ProjectNotificationRuleRevision_no_truncate",
  ]],
  ["ProjectNotificationRuleLifecycleEvent", [
    "ProjectNotificationRuleLifecycleEvent_append_only",
    "ProjectNotificationRuleLifecycleEvent_no_truncate",
  ]],
  ["ProjectNotificationEvaluation", [
    "ProjectNotificationEvaluation_append_only",
    "ProjectNotificationEvaluation_no_truncate",
  ]],
  ["ProjectNotificationSignalRedriveEvent", [
    "ProjectNotificationSignalRedriveEvent_append_only",
    "ProjectNotificationSignalRedriveEvent_no_truncate",
  ]],
  ["ProjectNotificationPublicationIntent", [
    "ProjectNotificationPublicationIntent_frozen_columns",
    "ProjectNotificationPublicationIntent_no_delete",
    "ProjectNotificationPublicationIntent_no_truncate",
  ]],
  ["ProjectNotificationSignal", [
    "ProjectNotificationSignal_frozen_columns",
    "ProjectNotificationSignal_no_delete",
    "ProjectNotificationSignal_no_truncate",
  ]],
  ["ProjectNotificationRule", [
    "ProjectNotificationRule_stable_identity",
  ]],
]);

export async function assertNotificationAuditFactsAreAppendOnly(definitionKey: string) {
  const rows = await prisma.$queryRaw<Array<{
    tableName: string;
    triggerName: string;
  }>>(Prisma.sql`
    SELECT relation.relname AS "tableName", trigger.tgname AS "triggerName"
    FROM pg_trigger AS trigger
    INNER JOIN pg_class AS relation ON relation.oid = trigger.tgrelid
    INNER JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = current_schema()
      AND trigger.tgisinternal IS FALSE
      AND relation.relname IN (${Prisma.join([...EXPECTED_TRIGGERS.keys()])})
  `);
  const actual = new Map<string, Set<string>>();
  for (const row of rows) {
    const names = actual.get(row.tableName) ?? new Set<string>();
    names.add(row.triggerName);
    actual.set(row.tableName, names);
  }
  for (const [tableName, triggerNames] of EXPECTED_TRIGGERS) {
    for (const triggerName of triggerNames) {
      assert.ok(actual.get(tableName)?.has(triggerName), `${tableName}.${triggerName} exists`);
    }
  }

  const definition = await prisma.notificationDefinition.findUniqueOrThrow({
    where: { key: definitionKey },
    select: { id: true },
  });
  await assert.rejects(
    prisma.$executeRaw(Prisma.sql`
      UPDATE "NotificationDefinitionRevision"
      SET "label" = "label"
      WHERE "definitionId" = ${definition.id}
    `),
    /append-only/,
  );
  await assert.rejects(
    prisma.$executeRawUnsafe('TRUNCATE TABLE "ProjectNotificationSignalRedriveEvent"'),
    /append-only/,
  );
  console.log("✓ notification audit facts reject row mutation and truncation");
}
