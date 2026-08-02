import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const migration = readFileSync(path.join(
  process.cwd(),
  "prisma/migrations/20260731014000_notification_audit_fact_immutability/migration.sql",
), "utf8");
const mixedFactMigration = readFileSync(path.join(
  process.cwd(),
  "prisma/migrations/20260731015000_notification_mixed_fact_guards/migration.sql",
), "utf8");

const rowImmutableTables = [
  "NotificationDefinitionRevision",
  "NotificationDeliveryAttempt",
  "ProjectNotificationRuleRevision",
  "ProjectNotificationRuleLifecycleEvent",
  "ProjectNotificationEvaluation",
  "ProjectNotificationSignalRedriveEvent",
];

test("notification audit facts reject update, delete and truncate at the database boundary", () => {
  for (const table of rowImmutableTables) {
    assert.match(
      migration,
      new RegExp(`BEFORE UPDATE OR DELETE ON "${table}"`),
    );
    assert.match(
      migration,
      new RegExp(`BEFORE TRUNCATE ON "${table}"`),
    );
  }
  assert.match(
    migration,
    /BEFORE TRUNCATE ON "NotificationDefinitionLifecycleEvent"/,
  );
  assert.match(migration, /ERRCODE = '55000'/);
});

test("notification mixed facts freeze identity snapshots while retaining state-machine updates", () => {
  assert.match(
    mixedFactMigration,
    /CREATE TRIGGER "NotificationDefinition_stable_identity"[\s\S]*BEFORE UPDATE ON "NotificationDefinition"/,
  );
  assert.match(
    mixedFactMigration,
    /ROW\(NEW\."createdByUserId", NEW\."createdAt"\)/,
  );
  assert.match(
    mixedFactMigration,
    /CREATE TRIGGER "ProjectNotificationRule_stable_identity"[\s\S]*BEFORE UPDATE ON "ProjectNotificationRule"/,
  );
  assert.match(
    mixedFactMigration,
    /ROW\(NEW\."projectId", NEW\."key", NEW\."createdByUserId", NEW\."createdAt"\)/,
  );
  for (const table of [
    "NotificationPublication",
    "NotificationDelivery",
    "ProjectNotificationPublicationIntent",
    "ProjectNotificationSignal",
  ]) {
    assert.match(mixedFactMigration, new RegExp(`BEFORE UPDATE ON "${table}"`));
    assert.match(mixedFactMigration, new RegExp(`BEFORE DELETE ON "${table}"`));
    assert.match(mixedFactMigration, new RegExp(`BEFORE TRUNCATE ON "${table}"`));
  }
  assert.match(mixedFactMigration, /NEW\."deliveryCount"/);
  assert.match(mixedFactMigration, /NEW\."requestJson"/);
  assert.match(mixedFactMigration, /NEW\."snapshotJson"/);
  assert.match(
    mixedFactMigration,
    /OLD\."recipientUserId" IS NOT NULL AND NEW\."recipientUserId" IS NULL/,
  );
  assert.match(
    mixedFactMigration,
    /OLD\."notificationId" IS NOT NULL AND NEW\."notificationId" IS NULL/,
  );
  assert.match(mixedFactMigration, /ERRCODE = '55000'/);
});
