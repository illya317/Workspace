import { z } from "zod";

import {
  projectNotificationFactsFingerprint,
  type ProjectNotificationSnapshot,
} from "./domain/project-notification-condition";
import { validateProjectNotificationWriteInput } from "./domain/project-notification-write-validation";

export const PROJECT_NOTIFICATION_SIGNAL_KINDS = [
  "project.updated",
  "project.archived",
  "project.restored",
  "project.scheduled",
] as const;

export type ProjectNotificationSignalKind = (typeof PROJECT_NOTIFICATION_SIGNAL_KINDS)[number];
export type ProjectNotificationSignalReplayPolicy = "strict" | "first-write-wins";

export const PROJECT_NOTIFICATION_MAX_PUBLISHED_RULES_PER_PROJECT = 500;
export const PROJECT_NOTIFICATION_SIGNAL_MAX_ATTEMPTS = 8;
export const PROJECT_NOTIFICATION_RATE_LIMIT_MIN_RETRY_MS = 61_000;

export const projectNotificationSignalInputSchema = z.object({
  projectId: z.number().int().positive(),
  signalKind: z.enum(PROJECT_NOTIFICATION_SIGNAL_KINDS),
  signalId: z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  changedField: z.string().trim().min(1).max(120).regex(/^[A-Za-z][A-Za-z0-9._-]*$/),
  occurredAt: z.date().optional(),
}).strict();

const storedProjectNotificationSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  eligibleRuleRevisions: z.array(z.object({
    ruleId: z.number().int().positive(),
    revision: z.number().int().positive(),
    publishedAt: z.string().datetime(),
  }).strict()).max(PROJECT_NOTIFICATION_MAX_PUBLISHED_RULES_PER_PROJECT),
  project: z.object({
    id: z.number().int().positive(),
    code: z.string().nullable(),
    name: z.string().min(1),
    status: z.string(),
    projectLevel: z.string(),
    completionPercent: z.number().finite().nullable(),
    plannedStartDate: z.string().nullable(),
    plannedEndDate: z.string().nullable(),
    riskPresent: z.boolean(),
    isArchived: z.boolean(),
    version: z.number().int().positive(),
  }).strict(),
  signal: z.object({
    kind: z.enum(PROJECT_NOTIFICATION_SIGNAL_KINDS),
    changedField: z.string().min(1).max(120),
    occurredAt: z.string().datetime(),
  }).strict(),
}).strict();

export type StoredProjectNotificationSnapshot = z.infer<
  typeof storedProjectNotificationSnapshotSchema
>;

export type ProjectNotificationSignalProjectRow = {
  id: number;
  code: string | null;
  name: string;
  status: string;
  projectLevel: string;
  completionPercent: number | null;
  plannedStartDate: Date | null;
  plannedEndDate: Date | null;
  riskNote: string | null;
  isArchived: boolean;
  version: number;
};

export type ClaimedProjectNotificationSignal = {
  id: string;
  projectId: number;
  projectVersion: number;
  signalKind: string;
  signalId: string;
  changedField: string;
  snapshotJson: string;
  factsFingerprint: string;
  occurredAt: Date;
  status: string;
  attemptCount: number;
  nextAttemptAt: Date | null;
  leaseToken: string;
  leaseExpiresAt: Date;
  createdAt: Date;
};

export function createStoredProjectNotificationSnapshot(input: {
  project: ProjectNotificationSignalProjectRow;
  signalKind: ProjectNotificationSignalKind;
  changedField: string;
  occurredAt: Date;
  eligibleRuleRevisions?: readonly { ruleId: number; revision: number; publishedAt: Date }[];
}): StoredProjectNotificationSnapshot {
  validateProjectNotificationWriteInput(input);
  return {
    schemaVersion: 1,
    eligibleRuleRevisions: [...(input.eligibleRuleRevisions ?? [])]
      .sort((left, right) => left.ruleId - right.ruleId || left.revision - right.revision)
      .map((entry) => ({ ...entry, publishedAt: entry.publishedAt.toISOString() })),
    project: {
      id: input.project.id,
      code: input.project.code,
      name: input.project.name,
      status: input.project.status,
      projectLevel: input.project.projectLevel,
      completionPercent: input.project.completionPercent,
      plannedStartDate: formatSnapshotDate(input.project.plannedStartDate),
      plannedEndDate: formatSnapshotDate(input.project.plannedEndDate),
      riskPresent: Boolean(input.project.riskNote?.trim()),
      isArchived: input.project.isArchived,
      version: input.project.version,
    },
    signal: {
      kind: input.signalKind,
      changedField: input.changedField,
      occurredAt: input.occurredAt.toISOString(),
    },
  };
}

export function projectNotificationConditionSnapshot(
  snapshot: StoredProjectNotificationSnapshot,
): ProjectNotificationSnapshot {
  return {
    project: {
      status: snapshot.project.status,
      projectLevel: snapshot.project.projectLevel,
      completionPercent: snapshot.project.completionPercent,
      plannedStartDate: snapshot.project.plannedStartDate,
      plannedEndDate: snapshot.project.plannedEndDate,
      riskPresent: snapshot.project.riskPresent,
      isArchived: snapshot.project.isArchived,
    },
    signal: {
      kind: snapshot.signal.kind,
      changedField: snapshot.signal.changedField,
    },
  };
}

export function parseClaimedProjectNotificationSnapshot(
  signal: ClaimedProjectNotificationSignal,
): StoredProjectNotificationSnapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(signal.snapshotJson);
  } catch {
    throw new ProjectNotificationSignalProcessingError(
      "signal_snapshot_invalid",
      "项目通知信号快照无效",
      true,
    );
  }
  const parsed = storedProjectNotificationSnapshotSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ProjectNotificationSignalProcessingError(
      "signal_snapshot_invalid",
      "项目通知信号快照无效",
      true,
    );
  }
  const snapshot = parsed.data;
  const fingerprint = projectNotificationFactsFingerprint(
    projectNotificationConditionSnapshot(snapshot),
  );
  if (
    snapshot.project.id !== signal.projectId
    || snapshot.project.version !== signal.projectVersion
    || snapshot.signal.kind !== signal.signalKind
    || snapshot.signal.changedField !== signal.changedField
    || fingerprint !== signal.factsFingerprint
  ) {
    throw new ProjectNotificationSignalProcessingError(
      "signal_snapshot_conflict",
      "项目通知信号快照与台账不一致",
      true,
    );
  }
  return snapshot;
}

export function projectNotificationSignalFingerprint(
  snapshot: StoredProjectNotificationSnapshot,
) {
  return projectNotificationFactsFingerprint(projectNotificationConditionSnapshot(snapshot));
}

type ProjectNotificationSignalReplayFacts = {
  projectId: number;
  projectVersion: number;
  signalKind: string;
  signalId: string;
  changedField: string;
  snapshotJson: string;
  factsFingerprint: string;
};

export function projectNotificationSignalReplayMatches(input: {
  policy: ProjectNotificationSignalReplayPolicy;
  stored: ProjectNotificationSignalReplayFacts;
  attempted: ProjectNotificationSignalReplayFacts;
}) {
  const sameStableIdentity = input.stored.signalId === input.attempted.signalId
    && input.stored.projectId === input.attempted.projectId
    && input.stored.signalKind === input.attempted.signalKind;
  if (!sameStableIdentity) return false;
  if (input.policy === "first-write-wins") return true;
  return input.stored.projectVersion === input.attempted.projectVersion
    && input.stored.changedField === input.attempted.changedField
    && input.stored.snapshotJson === input.attempted.snapshotJson
    && input.stored.factsFingerprint === input.attempted.factsFingerprint;
}

export function projectNotificationSignalFailurePlan(input: {
  attemptCount: number;
  now: Date;
  permanent?: boolean;
  preserveAttempt?: boolean;
  retryAt?: Date;
}) {
  if (input.preserveAttempt === true) {
    const minimumRetryAt = input.now.getTime() + PROJECT_NOTIFICATION_RATE_LIMIT_MIN_RETRY_MS;
    const requestedRetryAt = input.retryAt?.getTime();
    return {
      status: "retrying" as const,
      nextAttemptAt: new Date(Math.max(
        minimumRetryAt,
        Number.isFinite(requestedRetryAt) ? requestedRetryAt! : minimumRetryAt,
      )),
    };
  }
  const terminal = input.permanent === true
    || input.attemptCount >= PROJECT_NOTIFICATION_SIGNAL_MAX_ATTEMPTS;
  if (terminal) return { status: "failed" as const, nextAttemptAt: null };
  const delaySeconds = Math.min(3_600, 30 * 2 ** Math.max(0, input.attemptCount - 1));
  return {
    status: "retrying" as const,
    nextAttemptAt: new Date(input.now.getTime() + delaySeconds * 1_000),
  };
}

export class ProjectNotificationSignalProcessingError extends Error {
  constructor(
    readonly code: string,
    readonly safeSummary: string,
    readonly permanent: boolean,
    readonly retryAt?: Date,
  ) {
    super(safeSummary);
    this.name = "ProjectNotificationSignalProcessingError";
  }
}

function formatSnapshotDate(value: Date | null) {
  if (!value) return null;
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
