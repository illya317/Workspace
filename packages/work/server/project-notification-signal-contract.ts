import { z } from "zod";

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

export const storedProjectNotificationSnapshotSchema = z.object({
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
