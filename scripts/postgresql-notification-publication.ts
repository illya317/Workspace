import "dotenv/config";

import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

import type { ServiceResult } from "@workspace/platform/service-result";
import {
  archiveNotificationDefinition,
  buildNotificationPublicationCommand,
  commitNotificationPublication,
  publishNotificationDefinition,
  saveNotificationDefinition,
  type NotificationProjectionInput,
  type NotificationPublicationCommand,
  type NotificationPublicationSource,
} from "@workspace/platform/server/notification-publishing";
import { prisma, Prisma } from "@workspace/platform/server/prisma";
import {
  assertConcurrentWecomDeliveryResultAggregation,
  assertResultAndExpiredClaimShareLockOrder,
} from "./postgresql-notification-delivery-concurrency";
import { assertNotificationAuditFactsAreAppendOnly } from "./postgresql-notification-audit-immutability";
import { assertWecomEndpointHealthUsesEventTime } from "./postgresql-notification-endpoint-health";
import {
  cleanupNotificationPublicationFixture,
  type NotificationPublicationFixtureIdentity,
} from "./postgresql-notification-fixture-cleanup";
import { requirePostgresqlCiDatabase } from "./testing/e2e-database";
type PublishCommand = Extract<
  NotificationPublicationCommand,
  { kind: "publish" }
>;

type FixtureIdentity = NotificationPublicationFixtureIdentity;

type FixtureUserKey =
  | "actor"
  | "replay"
  | "conflict"
  | "archived"
  | "allowlist"
  | "rollbackA"
  | "rollbackB"
  | "caseUpper"
  | "caseLower"
  | "concurrentA"
  | "concurrentB";

type Fixture = FixtureIdentity & {
  users: Record<FixtureUserKey, { id: number; username: string }>;
  openApiClientId: number;
};

function check(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
  console.log(`✓ ${message}`);
}

function equal(actual: unknown, expected: unknown, message: string) {
  assert.equal(actual, expected, message);
  console.log(`✓ ${message}`);
}

function deepEqual(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  console.log(`✓ ${message}`);
}

function requireServiceOk<T>(result: ServiceResult<T>, label: string): T {
  if (!result.ok)
    throw new Error(`${label}: ${result.error} (${result.status ?? 500})`);
  return result.data;
}

function requireServiceFailure(
  result: ServiceResult<unknown>,
  status: number,
  label: string,
) {
  if (result.ok)
    throw new Error(`${label}: expected ${status}, received success`);
  equal(result.status, status, `${label} returns ${status}`);
}

function requirePublishCommand(
  result: Awaited<ReturnType<typeof buildNotificationPublicationCommand>>,
  label: string,
): PublishCommand {
  if (!result.ok) {
    throw new Error(
      `${label}: ${result.issue.message} (${result.issue.status ?? 400})`,
    );
  }
  if (result.data.kind !== "publish") {
    throw new Error(
      `${label}: expected a new publication command, received replay`,
    );
  }
  return result.data;
}

function source(
  fixture: Fixture,
  suffix: string,
): NotificationPublicationSource {
  return {
    kind: "user-api",
    id: `${fixture.sourcePrefix}${suffix}`,
    label: `PostgreSQL notification regression ${suffix}`,
  };
}

function definitionDraft(input: {
  fixture: Fixture;
  suffix: string;
  allowUserApi: boolean;
  allowedOpenApiClientIds?: number[];
  id?: number;
  expectedVersion?: number;
}) {
  const key = `${input.fixture.definitionPrefix}.${input.suffix}`;
  return {
    ...(input.id === undefined
      ? {}
      : { id: input.id, expectedVersion: input.expectedVersion }),
    key,
    label: `PostgreSQL notification ${input.suffix}`,
    description: `Disposable PostgreSQL transaction fixture ${input.fixture.token}`,
    titleTemplate: `PG ${input.fixture.token} ${input.suffix}: {{message}}`,
    bodyTemplate: "Notification publication transaction body: {{message}}",
    hrefTemplate: "/settings/notifications?message={{message}}",
    responseMode: "read" as const,
    isImportant: false,
    allowUserApi: input.allowUserApi,
    allowedOpenApiClientIds: input.allowedOpenApiClientIds ?? [],
  };
}

async function createPublishedDefinition(
  input: Parameters<typeof definitionDraft>[0],
) {
  const created = requireServiceOk(
    await saveNotificationDefinition(
      input.fixture.users.actor!.id,
      definitionDraft(input),
    ),
    `create ${input.suffix} definition`,
  );
  const published = requireServiceOk(
    await publishNotificationDefinition(
      input.fixture.users.actor!.id,
      created.key,
      created.version,
    ),
    `publish ${input.suffix} definition`,
  );
  return published;
}

async function buildCommand(input: {
  definitionKey: string;
  idempotencyKey: string;
  message: string;
  source: NotificationPublicationSource;
  usernames: string[];
  label: string;
}) {
  return requirePublishCommand(
    await buildNotificationPublicationCommand({
      source: input.source,
      request: {
        definitionKey: input.definitionKey,
        idempotencyKey: input.idempotencyKey,
        usernames: input.usernames,
        variables: { message: input.message },
      },
    }),
    input.label,
  );
}

async function persistProjection(
  projection: NotificationProjectionInput,
  client: Prisma.TransactionClient,
) {
  return client.notification.create({
    data: {
      recipientUserId: projection.recipientUserId,
      type: projection.type,
      title: projection.title,
      body: projection.body,
      href: projection.href,
      payloadJson: JSON.stringify(projection.payload),
      recipientReason: projection.recipientReason,
      dispatchId: projection.dispatchId,
      isImportant: projection.isImportant,
      requiresAcknowledgement: projection.requiresAcknowledgement,
      responseMode: projection.responseMode,
    },
  });
}

async function assertReplay(fixture: Fixture, definitionKey: string) {
  const publicationSource = source(fixture, "replay");
  const command = await buildCommand({
    definitionKey,
    idempotencyKey: `replay-${fixture.token}`,
    message: "same-payload",
    source: publicationSource,
    usernames: [fixture.users.replay!.username],
    label: "build replay command",
  });
  let projectionWrites = 0;
  const writer = async (
    projection: NotificationProjectionInput,
    client: Prisma.TransactionClient,
  ) => {
    projectionWrites += 1;
    return persistProjection(projection, client);
  };

  const first = requireServiceOk(
    await commitNotificationPublication(command, writer),
    "commit original replay fixture",
  );
  const replay = requireServiceOk(
    await commitNotificationPublication(command, writer),
    "replay identical publication",
  );

  equal(
    first.replayed,
    false,
    "first identical-key publication is committed once",
  );
  equal(replay.replayed, true, "same key and payload returns a replay receipt");
  equal(
    replay.publicationId,
    first.publicationId,
    "replay returns the original publication id",
  );
  equal(
    projectionWrites,
    1,
    "replay does not write a second notification projection",
  );
  equal(
    await prisma.notificationPublication.count({
      where: { id: first.publicationId },
    }),
    1,
    "replay leaves exactly one Publication row",
  );
  equal(
    await prisma.notification.count({
      where: { dispatchId: first.publicationId },
    }),
    1,
    "replay leaves exactly one Notification row",
  );
  equal(
    await prisma.notificationDelivery.count({
      where: { publicationId: first.publicationId },
    }),
    1,
    "replay leaves exactly one Delivery row",
  );
}

async function assertIdempotencyConflict(
  fixture: Fixture,
  definitionKey: string,
) {
  const publicationSource = source(fixture, "conflict");
  const idempotencyKey = `conflict-${fixture.token}`;
  const firstCommand = await buildCommand({
    definitionKey,
    idempotencyKey,
    message: "payload-a",
    source: publicationSource,
    usernames: [fixture.users.conflict!.username],
    label: "build first conflict command",
  });
  const conflictingCommand = await buildCommand({
    definitionKey,
    idempotencyKey,
    message: "payload-b",
    source: publicationSource,
    usernames: [fixture.users.conflict!.username],
    label: "build second conflict command before the first commit",
  });

  const first = requireServiceOk(
    await commitNotificationPublication(firstCommand, persistProjection),
    "commit first conflict fixture",
  );
  let conflictingProjectionWrites = 0;
  const conflict = await commitNotificationPublication(
    conflictingCommand,
    async (projection, client) => {
      conflictingProjectionWrites += 1;
      return persistProjection(projection, client);
    },
  );

  requireServiceFailure(conflict, 409, "same key with a different payload");
  equal(
    conflictingProjectionWrites,
    0,
    "idempotency conflict is rejected before projection writes",
  );
  equal(
    await prisma.notificationPublication.count({
      where: {
        sourceKind: publicationSource.kind,
        sourceId: publicationSource.id,
        idempotencyKey,
      },
    }),
    1,
    "idempotency conflict preserves the original Publication only",
  );
  equal(
    await prisma.notification.count({
      where: { dispatchId: first.publicationId },
    }),
    1,
    "idempotency conflict does not add a Notification",
  );
  equal(
    await prisma.notificationDelivery.count({
      where: { publicationId: first.publicationId },
    }),
    1,
    "idempotency conflict does not add a Delivery",
  );
}

async function assertArchivedDefinitionFailsClosed(fixture: Fixture) {
  const definition = await createPublishedDefinition({
    fixture,
    suffix: "archived",
    allowUserApi: true,
  });
  const publicationSource = source(fixture, "archived");
  const idempotencyKey = `archived-${fixture.token}`;
  const command = await buildCommand({
    definitionKey: definition.key,
    idempotencyKey,
    message: "built-before-archive",
    source: publicationSource,
    usernames: [fixture.users.archived!.username],
    label: "build command before definition archive",
  });
  requireServiceOk(
    await archiveNotificationDefinition(
      fixture.users.actor!.id,
      definition.key,
      definition.version,
    ),
    "archive definition after command build",
  );
  let projectionWrites = 0;
  const result = await commitNotificationPublication(
    command,
    async (projection, client) => {
      projectionWrites += 1;
      return persistProjection(projection, client);
    },
  );

  requireServiceFailure(result, 409, "archive between build and commit");
  equal(
    projectionWrites,
    0,
    "archived definition fails before projection writes",
  );
  equal(
    await prisma.notificationPublication.count({
      where: {
        sourceKind: publicationSource.kind,
        sourceId: publicationSource.id,
        idempotencyKey,
      },
    }),
    0,
    "archived definition leaves no Publication",
  );
  equal(
    await prisma.notification.count({
      where: { recipientUserId: fixture.users.archived!.id },
    }),
    0,
    "archived definition leaves no Notification",
  );
  equal(
    await prisma.notificationDelivery.count({
      where: { recipientUsername: fixture.users.archived!.username },
    }),
    0,
    "archived definition leaves no Delivery",
  );
}

async function assertAllowlistChangeFailsClosed(fixture: Fixture) {
  const definition = await createPublishedDefinition({
    fixture,
    suffix: "allowlist",
    allowUserApi: false,
    allowedOpenApiClientIds: [fixture.openApiClientId],
  });
  const publicationSource: NotificationPublicationSource = {
    kind: "open-api",
    id: String(fixture.openApiClientId),
    label: `PostgreSQL notification client ${fixture.token}`,
  };
  const idempotencyKey = `allowlist-${fixture.token}`;
  const command = await buildCommand({
    definitionKey: definition.key,
    idempotencyKey,
    message: "built-before-allowlist-change",
    source: publicationSource,
    usernames: [fixture.users.allowlist!.username],
    label: "build command before allowlist change",
  });
  const revised = requireServiceOk(
    await saveNotificationDefinition(
      fixture.users.actor!.id,
      definitionDraft({
        fixture,
        suffix: "allowlist",
        allowUserApi: false,
        allowedOpenApiClientIds: [],
        id: definition.id,
        expectedVersion: definition.version,
      }),
    ),
    "save allowlist removal after command build",
  );
  requireServiceOk(
    await publishNotificationDefinition(
      fixture.users.actor!.id,
      revised.key,
      revised.version,
    ),
    "publish allowlist removal after command build",
  );
  let projectionWrites = 0;
  const result = await commitNotificationPublication(
    command,
    async (projection, client) => {
      projectionWrites += 1;
      return persistProjection(projection, client);
    },
  );

  requireServiceFailure(
    result,
    409,
    "published allowlist change between build and commit",
  );
  equal(projectionWrites, 0, "allowlist change fails before projection writes");
  equal(
    await prisma.notificationPublication.count({
      where: {
        sourceKind: publicationSource.kind,
        sourceId: publicationSource.id,
        idempotencyKey,
      },
    }),
    0,
    "allowlist change leaves no Publication",
  );
  equal(
    await prisma.notification.count({
      where: { recipientUserId: fixture.users.allowlist!.id },
    }),
    0,
    "allowlist change leaves no Notification",
  );
  equal(
    await prisma.notificationDelivery.count({
      where: { recipientUsername: fixture.users.allowlist!.username },
    }),
    0,
    "allowlist change leaves no Delivery",
  );
}

async function assertProjectionFailureRollsBack(
  fixture: Fixture,
  definitionKey: string,
) {
  const publicationSource = source(fixture, "rollback");
  const idempotencyKey = `rollback-${fixture.token}`;
  const rollbackUsers = [fixture.users.rollbackA!, fixture.users.rollbackB!];
  const command = await buildCommand({
    definitionKey,
    idempotencyKey,
    message: "projection-failure",
    source: publicationSource,
    usernames: rollbackUsers.map((user) => user.username),
    label: "build projection rollback command",
  });
  let projectionWrites = 0;
  let insideTransaction: {
    publications: number;
    notifications: number;
    deliveries: number;
  } | null = null;
  const originalConsoleError = console.error;
  const loggedErrors: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    loggedErrors.push(args);
  };
  let result: Awaited<ReturnType<typeof commitNotificationPublication>>;
  try {
    result = await commitNotificationPublication(
      command,
      async (projection, client) => {
        projectionWrites += 1;
        const notification = await persistProjection(projection, client);
        if (projectionWrites === 2) {
          insideTransaction = {
            publications: await client.notificationPublication.count({
              where: { id: projection.dispatchId },
            }),
            notifications: await client.notification.count({
              where: { dispatchId: projection.dispatchId },
            }),
            deliveries: await client.notificationDelivery.count({
              where: { publicationId: projection.dispatchId },
            }),
          };
          throw new Error(`intentional projection failure ${fixture.token}`);
        }
        return notification;
      },
    );
  } finally {
    console.error = originalConsoleError;
  }

  requireServiceFailure(result!, 500, "projection writer failure");
  equal(
    projectionWrites,
    2,
    "projection failure occurs after the second Notification write",
  );
  deepEqual(
    insideTransaction,
    { publications: 1, notifications: 2, deliveries: 1 },
    "transaction contains partial Publication, Notification, and Delivery rows before failure",
  );
  check(
    loggedErrors.length > 0,
    "projection failure is surfaced through the service error path",
  );
  equal(
    await prisma.notificationPublication.count({
      where: {
        sourceKind: publicationSource.kind,
        sourceId: publicationSource.id,
        idempotencyKey,
      },
    }),
    0,
    "projection failure rolls back Publication",
  );
  equal(
    await prisma.notification.count({
      where: { recipientUserId: { in: rollbackUsers.map((user) => user.id) } },
    }),
    0,
    "projection failure rolls back every Notification",
  );
  equal(
    await prisma.notificationDelivery.count({
      where: {
        recipientUsername: { in: rollbackUsers.map((user) => user.username) },
      },
    }),
    0,
    "projection failure rolls back every Delivery",
  );
}

async function assertCaseOrderingIsCollationIndependent(
  fixture: Fixture,
  definitionKey: string,
) {
  const publicationSource = source(fixture, "case-order");
  const caseUsers = [fixture.users.caseLower!, fixture.users.caseUpper!];
  const expectedUsernames = caseUsers.map((user) => user.username).sort();
  const command = await buildCommand({
    definitionKey,
    idempotencyKey: `case-order-${fixture.token}`,
    message: "case-sensitive-usernames",
    source: publicationSource,
    usernames: caseUsers.map((user) => user.username),
    label: "build mixed-case recipient command",
  });
  deepEqual(
    command.request.usernames,
    expectedUsernames,
    "mixed-case usernames use application canonical ordering",
  );
  const [database] = await prisma.$queryRaw<
    Array<{ collation: string }>
  >(Prisma.sql`
    SELECT datcollate AS collation
    FROM pg_database
    WHERE datname = current_database()
  `);
  const databaseOrdered = await prisma.user.findMany({
    where: { username: { in: expectedUsernames } },
    orderBy: { username: "asc" },
    select: { username: true },
  });
  const result = requireServiceOk(
    await commitNotificationPublication(command, persistProjection),
    "commit mixed-case recipient publication",
  );
  const deliveries = await prisma.notificationDelivery.findMany({
    where: { publicationId: result.publicationId },
    orderBy: { id: "asc" },
    select: { recipientUserId: true, recipientUsername: true },
  });

  deepEqual(
    deliveries.map((delivery) => delivery.recipientUsername),
    expectedUsernames,
    `mixed-case recipients commit independently of PostgreSQL collation (${database?.collation ?? "unknown"})`,
  );
  const caseUserByUsername = new Map(
    caseUsers.map((user) => [user.username, user]),
  );
  for (const delivery of deliveries) {
    equal(
      delivery.recipientUserId,
      caseUserByUsername.get(delivery.recipientUsername)!.id,
      `Delivery preserves the canonical user id for ${delivery.recipientUsername}`,
    );
  }
  const databaseOrder = databaseOrdered.map((user) => user.username);
  if (JSON.stringify(databaseOrder) !== JSON.stringify(expectedUsernames)) {
    console.log(
      "✓ fixture exercises a PostgreSQL/application collation order difference",
    );
  } else {
    console.log(
      "✓ mixed-case fixture passes under the current PostgreSQL collation order",
    );
  }
}

function createFixtureIdentity(): FixtureIdentity {
  const token =
    `${Date.now().toString(36)}${process.pid.toString(36)}`.toLowerCase();
  return {
    token,
    definitionPrefix: `custom.ci.pg${token}`,
    usernamePrefix: `notification_pg_${token}`,
    sourcePrefix: `notification-pg:${token}:`,
    clientKeyHashPrefix: `notification-pg-${token}`,
  };
}

async function createFixture(identity: FixtureIdentity): Promise<Fixture> {
  const { token, usernamePrefix, clientKeyHashPrefix } = identity;
  const usernames = [
    `${usernamePrefix}_actor`,
    `${usernamePrefix}_replay`,
    `${usernamePrefix}_conflict`,
    `${usernamePrefix}_archived`,
    `${usernamePrefix}_allowlist`,
    `${usernamePrefix}_rollback_a`,
    `${usernamePrefix}_rollback_b`,
    `${usernamePrefix}_case_A`,
    `${usernamePrefix}_case_a`,
    `${usernamePrefix}_concurrent_a`,
    `${usernamePrefix}_concurrent_b`,
  ];
  await prisma.user.createMany({
    data: usernames.map((username, index) => ({
      username,
      canLogin: true,
      wxUserId: index >= 9 ? `wx_${token}_${index}` : null,
    })),
  });
  const rows = await prisma.user.findMany({
    where: { username: { in: usernames } },
    select: { id: true, username: true },
  });
  check(
    rows.length === usernames.length,
    "notification publication fixture users are created exactly once",
  );
  const userByUsername = new Map(rows.map((user) => [user.username, user]));
  const users = {
    actor: userByUsername.get(usernames[0]!)!,
    replay: userByUsername.get(usernames[1]!)!,
    conflict: userByUsername.get(usernames[2]!)!,
    archived: userByUsername.get(usernames[3]!)!,
    allowlist: userByUsername.get(usernames[4]!)!,
    rollbackA: userByUsername.get(usernames[5]!)!,
    rollbackB: userByUsername.get(usernames[6]!)!,
    caseUpper: userByUsername.get(usernames[7]!)!,
    caseLower: userByUsername.get(usernames[8]!)!,
    concurrentA: userByUsername.get(usernames[9]!)!,
    concurrentB: userByUsername.get(usernames[10]!)!,
  };
  const openApiClient = await prisma.openApiClient.create({
    data: {
      name: `Notification PostgreSQL ${token}`,
      keyHash: `${clientKeyHashPrefix}-hash`,
      status: "active",
    },
  });
  return {
    ...identity,
    users,
    openApiClientId: openApiClient.id,
  };
}

export async function assertNotificationPublicationTransactions() {
  const database = requirePostgresqlCiDatabase();
  console.log(
    `✓ notification publication regression is isolated to a *_ci database (${database.databaseName})`,
  );
  const identity = createFixtureIdentity();
  try {
    const fixture = await createFixture(identity);
    const standardDefinition = await createPublishedDefinition({
      fixture,
      suffix: "standard",
      allowUserApi: true,
    });
    await assertReplay(fixture, standardDefinition.key);
    await assertIdempotencyConflict(fixture, standardDefinition.key);
    await assertArchivedDefinitionFailsClosed(fixture);
    await assertAllowlistChangeFailsClosed(fixture);
    await assertProjectionFailureRollsBack(fixture, standardDefinition.key);
    await assertConcurrentWecomDeliveryResultAggregation({
      definitionKey: standardDefinition.key,
      idempotencyKey: `concurrent-results-${fixture.token}`,
      source: source(fixture, "concurrent-results"),
      usernames: [
        fixture.users.concurrentA.username,
        fixture.users.concurrentB.username,
      ],
      token: fixture.token,
    });
    await assertResultAndExpiredClaimShareLockOrder({
      definitionKey: standardDefinition.key,
      idempotencyKey: `result-expired-claim-${fixture.token}`,
      source: source(fixture, "result-expired-claim"),
      usernames: [
        fixture.users.concurrentA.username,
        fixture.users.concurrentB.username,
      ],
      token: fixture.token,
    });
    await assertWecomEndpointHealthUsesEventTime({
      definitionKey: standardDefinition.key,
      sourcePrefix: `${fixture.sourcePrefix}endpoint-health`,
      usernames: [
        fixture.users.concurrentA.username,
        fixture.users.concurrentB.username,
      ],
      token: fixture.token,
    });
    await assertNotificationAuditFactsAreAppendOnly(standardDefinition.key);
    await assertCaseOrderingIsCollationIndependent(
      fixture,
      standardDefinition.key,
    );
  } finally {
    await cleanupNotificationPublicationFixture(identity);
  }
}

async function main() {
  try {
    await assertNotificationPublicationTransactions();
  } finally {
    await prisma.$disconnect();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
