import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { validateProjectNotificationWriteInput } from "./domain/project-notification-write-validation";
import { PROJECT_NOTIFICATION_MAX_PUBLISHED_RULES_PER_PROJECT } from "./project-notification-signal-contract";

type ProjectNotificationRulePublishInput = {
  ruleId: number;
  projectId: number;
  revision: number;
  expectedVersion: number;
  actorUserId: number;
  occurredAt: Date;
};

export const PROJECT_NOTIFICATION_PUBLISHED_RULE_CAPACITY_MESSAGE =
  `每个项目最多发布 ${PROJECT_NOTIFICATION_MAX_PUBLISHED_RULES_PER_PROJECT} 条通知规则`;

export async function commitProjectNotificationRulePublish(
  input: ProjectNotificationRulePublishInput,
) {
  validateProjectNotificationWriteInput(input);
  return prisma.$transaction((tx) => commitProjectNotificationRulePublishInTransaction(tx, input));
}

export async function commitProjectNotificationRulePublishInTransaction(
  tx: Prisma.TransactionClient,
  input: ProjectNotificationRulePublishInput,
) {
  validateProjectNotificationWriteInput(input);
  const projects = await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`
    SELECT "id"
    FROM "Project"
    WHERE "id" = ${input.projectId}
    FOR UPDATE
  `);
  if (!projects[0]) return { outcome: "conflict" as const };

  const rules = await tx.$queryRaw<Array<{
    id: number;
    status: string;
    revision: number;
    version: number;
  }>>(Prisma.sql`
    SELECT "id", "status", "revision", "version"
    FROM "ProjectNotificationRule"
    WHERE "id" = ${input.ruleId} AND "projectId" = ${input.projectId}
    FOR UPDATE
  `);
  const current = rules[0];
  if (
    !current
    || current.status === "archived"
    || current.revision !== input.revision
    || current.version !== input.expectedVersion
  ) {
    return { outcome: "conflict" as const };
  }

  if (current.status !== "published") {
    const publishedRuleCount = await tx.projectNotificationRule.count({
      where: { projectId: input.projectId, status: "published" },
    });
    if (publishedRuleCount >= PROJECT_NOTIFICATION_MAX_PUBLISHED_RULES_PER_PROJECT) {
      return {
        outcome: "capacity-exceeded" as const,
        error: {
          message: PROJECT_NOTIFICATION_PUBLISHED_RULE_CAPACITY_MESSAGE,
          status: 409 as const,
          details: {
            publishedRuleCount,
            publishedRuleMaxCount: PROJECT_NOTIFICATION_MAX_PUBLISHED_RULES_PER_PROJECT,
          },
        },
      };
    }
  }

  const changed = await tx.projectNotificationRule.updateMany({
    where: {
      id: input.ruleId,
      projectId: input.projectId,
      status: { not: "archived" },
      revision: input.revision,
      version: input.expectedVersion,
    },
    data: {
      status: "published",
      publishedRevision: input.revision,
      publishedAt: input.occurredAt,
      publishedByUserId: input.actorUserId,
      updatedByUserId: input.actorUserId,
      version: { increment: 1 },
    },
  });
  if (changed.count !== 1) return { outcome: "conflict" as const };
  await appendLifecycleEvent(tx, {
    ruleId: input.ruleId,
    revision: input.revision,
    action: "published",
    actorUserId: input.actorUserId,
    occurredAt: input.occurredAt,
    priorVersion: input.expectedVersion,
  });
  const rule = await tx.projectNotificationRule.findUnique({ where: { id: input.ruleId } });
  return rule ? { outcome: "published" as const, rule } : { outcome: "conflict" as const };
}

export async function commitProjectNotificationRuleArchive(input: {
  ruleId: number;
  projectId: number;
  expectedVersion: number;
  actorUserId: number;
  occurredAt: Date;
}) {
  validateProjectNotificationWriteInput(input);
  return prisma.$transaction(async (tx) => {
    const current = await tx.projectNotificationRule.findFirst({
      where: { id: input.ruleId, projectId: input.projectId },
    });
    if (!current || current.status === "archived" || current.version !== input.expectedVersion) {
      return null;
    }
    const changed = await tx.projectNotificationRule.updateMany({
      where: {
        id: current.id,
        projectId: input.projectId,
        status: { not: "archived" },
        version: input.expectedVersion,
      },
      data: {
        status: "archived",
        archivedAt: input.occurredAt,
        archivedByUserId: input.actorUserId,
        updatedByUserId: input.actorUserId,
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1) return null;
    await appendLifecycleEvent(tx, {
      ruleId: current.id,
      revision: current.revision,
      action: "archived",
      actorUserId: input.actorUserId,
      occurredAt: input.occurredAt,
      priorVersion: current.version,
    });
    return tx.projectNotificationRule.findUnique({ where: { id: current.id } });
  });
}

async function appendLifecycleEvent(
  tx: Prisma.TransactionClient,
  input: {
    ruleId: number;
    revision: number;
    action: "published" | "archived";
    actorUserId: number;
    occurredAt: Date;
    priorVersion: number;
  },
) {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "ProjectNotificationRuleLifecycleEvent" (
      "id", "ruleId", "revision", "action", "actorUserId", "occurredAt",
      "priorVersion", "newVersion"
    ) VALUES (
      ${randomUUID()}, ${input.ruleId}, ${input.revision}, ${input.action},
      ${input.actorUserId}, ${input.occurredAt}, ${input.priorVersion},
      ${input.priorVersion + 1}
    )
  `);
}
