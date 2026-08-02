import "server-only";

import { Prisma, prisma } from "@workspace/platform/server/prisma";

const RECENT_FAILURE_LIMIT = 5;

type StatusCountRow = { status: string; count: bigint };
type FailureRow = {
  signalRecordId: string;
  signalKind: string;
  signalId: string;
  attemptCount: number;
  ruleIds: number[];
  errorCode: string | null;
  errorSummary: string | null;
  failedAt: Date;
};

export async function getProjectNotificationQueueHealth(input: {
  projectId: number;
  includeFailureDetails: boolean;
}) {
  const [statusRows, failureRows] = await Promise.all([
    prisma.$queryRaw<StatusCountRow[]>(Prisma.sql`
      SELECT signal."status", COUNT(*)::bigint AS "count"
      FROM "ProjectNotificationSignal" AS signal
      WHERE signal."projectId" = ${input.projectId}
        AND signal."status" IN ('pending', 'leased', 'retrying', 'failed')
        AND (
          signal."status" <> 'failed'
          OR NOT EXISTS (
            SELECT 1
            FROM "ProjectNotificationSignalRedriveEvent" AS handled_redrive
            WHERE handled_redrive."sourceSignalRecordId" = signal."id"
          )
        )
      GROUP BY signal."status"
    `),
    input.includeFailureDetails
      ? prisma.$queryRaw<FailureRow[]>(Prisma.sql`
          WITH failed_signals AS (
            SELECT
              signal."id", signal."signalKind", signal."signalId", signal."attemptCount",
              signal."lastErrorCode", signal."lastErrorSummary", signal."failedAt"
            FROM "ProjectNotificationSignal" AS signal
            WHERE signal."projectId" = ${input.projectId}
              AND signal."status" = 'failed'
              AND signal."failedAt" IS NOT NULL
              AND NOT EXISTS (
                SELECT 1
                FROM "ProjectNotificationSignalRedriveEvent" AS handled_redrive
                WHERE handled_redrive."sourceSignalRecordId" = signal."id"
              )
            ORDER BY signal."failedAt" DESC, signal."id" DESC
            LIMIT ${RECENT_FAILURE_LIMIT}
          )
          SELECT
            signal."id" AS "signalRecordId", signal."signalKind", signal."signalId",
            signal."attemptCount",
            COALESCE(
              ARRAY_AGG(DISTINCT evaluation."ruleId" ORDER BY evaluation."ruleId")
                FILTER (WHERE evaluation."ruleId" IS NOT NULL),
              ARRAY[]::integer[]
            ) AS "ruleIds",
            signal."lastErrorCode" AS "errorCode",
            signal."lastErrorSummary" AS "errorSummary", signal."failedAt"
          FROM failed_signals AS signal
          LEFT JOIN "ProjectNotificationEvaluation" AS evaluation
            ON evaluation."signalKind" = signal."signalKind"
            AND evaluation."signalId" = signal."signalId"
            AND evaluation."outcome" = 'error'
          GROUP BY
            signal."id", signal."signalKind", signal."signalId", signal."attemptCount",
            signal."lastErrorCode", signal."lastErrorSummary", signal."failedAt"
          ORDER BY signal."failedAt" DESC, signal."id" DESC
        `)
      : Promise.resolve([]),
  ]);
  const countByStatus = new Map(statusRows.map((row) => [row.status, Number(row.count)]));
  const counts = {
    pending: countByStatus.get("pending") ?? 0,
    leased: countByStatus.get("leased") ?? 0,
    retrying: countByStatus.get("retrying") ?? 0,
    failed: countByStatus.get("failed") ?? 0,
  };
  return {
    counts,
    backlogCount: counts.pending + counts.leased + counts.retrying,
    recentFailures: failureRows.map((row) => ({
      signalRecordId: row.signalRecordId,
      signalKind: row.signalKind,
      signalId: row.signalId,
      attemptCount: row.attemptCount,
      ruleIds: row.ruleIds,
      errorCode: row.errorCode,
      errorSummary: row.errorSummary,
      failedAt: row.failedAt.toISOString(),
    })),
  };
}
