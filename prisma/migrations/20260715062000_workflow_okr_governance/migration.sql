-- workspace:migration-mode=maintenance
BEGIN;

CREATE FUNCTION "_workspace_workflow_okr_try_jsonb"("input" TEXT)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    RETURN "input"::jsonb;
EXCEPTION WHEN others THEN
    RETURN NULL;
END;
$$;

ALTER TABLE "ApprovalRequest"
ADD COLUMN "sourceWorkflowPolicyId" INTEGER,
ADD COLUMN "sourceWorkflowPolicyVersion" INTEGER,
ADD COLUMN "sourceActionContractVersion" INTEGER,
ADD COLUMN "sourceOkrControlVersion" INTEGER;

ALTER TABLE "WorkOkrControlPolicy"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "WorkPlan"
ADD COLUMN "governanceMode" TEXT NOT NULL DEFAULT 'legacy_inferred',
ADD COLUMN "governanceRevision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "governanceActionKey" TEXT,
ADD COLUMN "governanceWorkflowPolicyId" INTEGER,
ADD COLUMN "governanceWorkflowVersion" INTEGER,
ADD COLUMN "governanceActionContractVersion" INTEGER,
ADD COLUMN "governanceOkrControlVersion" INTEGER,
ADD COLUMN "governanceSnapshotJson" TEXT NOT NULL DEFAULT '{}',
ADD COLUMN "governanceBoundAt" TIMESTAMP(3),
ADD COLUMN "governanceBoundByUserId" INTEGER,
ADD COLUMN "governanceBindingSource" TEXT NOT NULL DEFAULT 'legacy_inferred';

CREATE TABLE "WorkOkrControlRevision" (
    "id" SERIAL NOT NULL,
    "version" INTEGER NOT NULL,
    "settingsJson" TEXT NOT NULL,
    "actorUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOkrControlRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkOkrControlPolicyRevision" (
    "id" SERIAL NOT NULL,
    "policyId" INTEGER,
    "cycleId" INTEGER NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL,
    "changeKind" TEXT NOT NULL DEFAULT 'upsert',
    "snapshotJson" TEXT NOT NULL,
    "actorUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOkrControlPolicyRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkPlanGovernanceEvent" (
    "id" SERIAL NOT NULL,
    "workPlanId" INTEGER NOT NULL,
    "fromMode" TEXT NOT NULL,
    "toMode" TEXT NOT NULL,
    "fromSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "toSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "reason" TEXT NOT NULL,
    "actorUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkPlanGovernanceEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkOkrControlRevision_version_key"
ON "WorkOkrControlRevision"("version");

CREATE INDEX "WorkOkrControlRevision_createdAt_idx"
ON "WorkOkrControlRevision"("createdAt");

CREATE INDEX "WorkOkrControlPolicyRevision_cycleId_scopeType_scopeId_vers_idx"
ON "WorkOkrControlPolicyRevision"("cycleId", "scopeType", "scopeId", "version");

CREATE INDEX "WorkOkrControlPolicyRevision_policyId_version_idx"
ON "WorkOkrControlPolicyRevision"("policyId", "version");

CREATE INDEX "WorkPlanGovernanceEvent_workPlanId_createdAt_idx"
ON "WorkPlanGovernanceEvent"("workPlanId", "createdAt");

CREATE INDEX "WorkPlanGovernanceEvent_actorUserId_createdAt_idx"
ON "WorkPlanGovernanceEvent"("actorUserId", "createdAt");

CREATE INDEX "WorkPlan_governanceMode_governanceBindingSource_idx"
ON "WorkPlan"("governanceMode", "governanceBindingSource");

ALTER TABLE "WorkPlanGovernanceEvent"
ADD CONSTRAINT "WorkPlanGovernanceEvent_workPlanId_fkey"
FOREIGN KEY ("workPlanId") REFERENCES "WorkPlan"("id")
ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

INSERT INTO "WorkOkrControlRevision" (
    "version",
    "settingsJson",
    "actorUserId"
)
VALUES (
    1,
    COALESCE(
        (SELECT "value" FROM "SystemConfig" WHERE "key" = 'work.okr.control.settings'),
        '{"enabled":true,"objectiveOpensAt":{"anchor":"periodStart","offsetDays":-7},"objectiveSubmitDeadline":{"anchor":"periodStart","offsetDays":0},"krReviewOpensAt":{"anchor":"periodEnd","offsetDays":0},"krSubmitDeadline":{"anchor":"periodEnd","offsetDays":14},"autoLock":"afterKrDeadline","periodTypes":{"yearly":{"mode":"inherit"},"half_year":{"mode":"inherit"},"quarterly":{"mode":"inherit"},"monthly":{"mode":"inherit"},"weekly":{"mode":"report_only"}}}'
    ),
    NULL
);

INSERT INTO "WorkOkrControlPolicyRevision" (
    "policyId",
    "cycleId",
    "scopeType",
    "scopeId",
    "version",
    "changeKind",
    "snapshotJson",
    "actorUserId",
    "createdAt"
)
SELECT
    policy."id",
    policy."cycleId",
    policy."scopeType",
    policy."scopeId",
    policy."version",
    'legacy_inferred',
    jsonb_build_object(
        'id', policy."id",
        'cycleId', policy."cycleId",
        'scopeType', policy."scopeType",
        'scopeId', policy."scopeId",
        'isLocked', policy."isLocked",
        'objectiveSubmitDeadline', policy."objectiveSubmitDeadline",
        'krReviewOpensAt', policy."krReviewOpensAt",
        'krSubmitDeadline', policy."krSubmitDeadline",
        'version', policy."version"
    )::text,
    NULL,
    policy."updatedAt"
FROM "WorkOkrControlPolicy" AS policy;

WITH plan_bindings AS (
    SELECT
        plan."id",
        CASE
            WHEN plan."targetType" = 'personal'
                THEN 'work.tasks.goal.personal.objective.submit'
            ELSE 'work.tasks.goal.department.objective.submit'
        END AS objective_action_key,
        CASE
            WHEN plan."targetType" = 'personal'
                THEN 'work.tasks.goal.personal.report.submit'
            ELSE 'work.tasks.goal.department.report.submit'
        END AS report_action_key,
        CASE
            WHEN plan."targetType" = 'personal'
                THEN 'work.tasks.goal.personal.objective.revise'
            ELSE 'work.tasks.goal.department.objective.revise'
        END AS revision_action_key,
        CASE
            WHEN plan."targetType" = 'personal'
                THEN 'work.tasks.goal.personal.report.correct'
            ELSE 'work.tasks.goal.department.report.correct'
        END AS correction_action_key,
        CASE
            WHEN objective_policy."mode" IN ('permission_only', 'direct')
                THEN 'unavailable'
            ELSE 'workflow'
        END AS governance_mode,
        objective_policy."id" AS policy_id,
        objective_policy."version" AS policy_version,
        jsonb_build_object(
            'version', 1,
            'source', 'legacy_inferred',
            'boundAt', CURRENT_TIMESTAMP,
            'okrControl', jsonb_build_object(
                'version', 1,
                'settings', COALESCE(
                    (SELECT "_workspace_workflow_okr_try_jsonb"("value") FROM "SystemConfig" WHERE "key" = 'work.okr.control.settings'),
                    '{"enabled":true,"objectiveOpensAt":{"anchor":"periodStart","offsetDays":-7},"objectiveSubmitDeadline":{"anchor":"periodStart","offsetDays":0},"krReviewOpensAt":{"anchor":"periodEnd","offsetDays":0},"krSubmitDeadline":{"anchor":"periodEnd","offsetDays":14},"autoLock":"afterKrDeadline","periodTypes":{"yearly":{"mode":"inherit"},"half_year":{"mode":"inherit"},"quarterly":{"mode":"inherit"},"monthly":{"mode":"inherit"},"weekly":{"mode":"report_only"}}}'::jsonb
                ),
                'policy', CASE WHEN control_policy."id" IS NULL THEN NULL ELSE jsonb_build_object(
                    'id', control_policy."id",
                    'cycleId', control_policy."cycleId",
                    'scopeType', control_policy."scopeType",
                    'scopeId', control_policy."scopeId",
                    'isLocked', control_policy."isLocked",
                    'objectiveSubmitDeadline', control_policy."objectiveSubmitDeadline",
                    'krReviewOpensAt', control_policy."krReviewOpensAt",
                    'krSubmitDeadline', control_policy."krSubmitDeadline",
                    'version', control_policy."version"
                ) END
            ),
            'actions', jsonb_build_object(
                'objective_submit', jsonb_build_object(
                    'businessActionKey', CASE WHEN plan."targetType" = 'personal' THEN 'work.tasks.goal.personal.objective.submit' ELSE 'work.tasks.goal.department.objective.submit' END,
                    'actionContractVersion', 1,
                    'workflowWhenDisabled', 'unavailable',
                    'policy', jsonb_build_object(
                        'businessActionKey', CASE WHEN plan."targetType" = 'personal' THEN 'work.tasks.goal.personal.objective.submit' ELSE 'work.tasks.goal.department.objective.submit' END,
                        'scopeType', COALESCE(objective_policy."scopeType", 'global'),
                        'scopeId', COALESCE(objective_policy."scopeId", ''),
                        'mode', COALESCE(objective_policy."mode", 'required'),
                        'flowType', COALESCE(objective_policy."flowType", 'approval'),
                        'separationPolicy', COALESCE(objective_policy."separationPolicy", 'auto_pass_if_authorized'),
                        'handlerSource', COALESCE(objective_policy."handlerSource", 'permission'),
                        'workflowNodes', COALESCE(
                            "_workspace_workflow_okr_try_jsonb"(objective_policy."workflowNodesJson"),
                            jsonb_build_array(jsonb_build_object(
                                'key', CASE WHEN plan."targetType" = 'personal' THEN 'work-task-goal-personal-objective-submit' ELSE 'work-task-goal-department-objective-submit' END,
                                'kind', 'approval',
                                'assignees', jsonb_build_array(jsonb_build_object('fieldKind', 'relationship', 'value', NULL::text)),
                                'approvalMode', 'any_one'
                            ))
                        ),
                        'handlerCanRevise', COALESCE(objective_policy."handlerCanRevise", true),
                        'requestCanWithdraw', COALESCE(objective_policy."requestCanWithdraw", true),
                        'requestCanResubmit', COALESCE(objective_policy."requestCanResubmit", true),
                        'requestCanCancel', COALESCE(objective_policy."requestCanCancel", true),
                        'requestCanRevise', COALESCE(objective_policy."requestCanRevise", true),
                        'policyId', objective_policy."id",
                        'policyVersion', objective_policy."version"
                    )
                ),
                'report_submit', jsonb_build_object(
                    'businessActionKey', CASE WHEN plan."targetType" = 'personal' THEN 'work.tasks.goal.personal.report.submit' ELSE 'work.tasks.goal.department.report.submit' END,
                    'actionContractVersion', 1,
                    'workflowWhenDisabled', 'unavailable',
                    'policy', jsonb_build_object(
                        'businessActionKey', CASE WHEN plan."targetType" = 'personal' THEN 'work.tasks.goal.personal.report.submit' ELSE 'work.tasks.goal.department.report.submit' END,
                        'scopeType', COALESCE(report_policy."scopeType", 'global'),
                        'scopeId', COALESCE(report_policy."scopeId", ''),
                        'mode', COALESCE(report_policy."mode", 'required'),
                        'flowType', COALESCE(report_policy."flowType", 'approval'),
                        'separationPolicy', COALESCE(report_policy."separationPolicy", 'auto_pass_if_authorized'),
                        'handlerSource', COALESCE(report_policy."handlerSource", 'permission'),
                        'workflowNodes', COALESCE(
                            "_workspace_workflow_okr_try_jsonb"(report_policy."workflowNodesJson"),
                            jsonb_build_array(jsonb_build_object(
                                'key', CASE WHEN plan."targetType" = 'personal' THEN 'work-task-goal-personal-report-submit' ELSE 'work-task-goal-department-report-submit' END,
                                'kind', 'approval',
                                'assignees', jsonb_build_array(jsonb_build_object('fieldKind', 'relationship', 'value', NULL::text)),
                                'approvalMode', 'any_one'
                            ))
                        ),
                        'handlerCanRevise', COALESCE(report_policy."handlerCanRevise", true),
                        'requestCanWithdraw', COALESCE(report_policy."requestCanWithdraw", true),
                        'requestCanResubmit', COALESCE(report_policy."requestCanResubmit", true),
                        'requestCanCancel', COALESCE(report_policy."requestCanCancel", true),
                        'requestCanRevise', COALESCE(report_policy."requestCanRevise", true),
                        'policyId', report_policy."id",
                        'policyVersion', report_policy."version"
                    )
                ),
                'objective_revise', jsonb_build_object(
                    'businessActionKey', CASE WHEN plan."targetType" = 'personal' THEN 'work.tasks.goal.personal.objective.revise' ELSE 'work.tasks.goal.department.objective.revise' END,
                    'actionContractVersion', 1,
                    'workflowWhenDisabled', 'direct_write',
                    'policy', jsonb_build_object(
                        'businessActionKey', CASE WHEN plan."targetType" = 'personal' THEN 'work.tasks.goal.personal.objective.revise' ELSE 'work.tasks.goal.department.objective.revise' END,
                        'scopeType', COALESCE(revision_policy."scopeType", 'global'),
                        'scopeId', COALESCE(revision_policy."scopeId", ''),
                        'mode', COALESCE(revision_policy."mode", 'required'),
                        'flowType', COALESCE(revision_policy."flowType", 'approval'),
                        'separationPolicy', COALESCE(revision_policy."separationPolicy", 'auto_pass_if_authorized'),
                        'handlerSource', COALESCE(revision_policy."handlerSource", 'permission'),
                        'workflowNodes', COALESCE(
                            "_workspace_workflow_okr_try_jsonb"(revision_policy."workflowNodesJson"),
                            jsonb_build_array(jsonb_build_object(
                                'key', CASE WHEN plan."targetType" = 'personal' THEN 'work-task-goal-personal-objective-revise' ELSE 'work-task-goal-department-objective-revise' END,
                                'kind', 'approval',
                                'assignees', jsonb_build_array(jsonb_build_object('fieldKind', 'relationship', 'value', NULL::text)),
                                'approvalMode', 'any_one'
                            ))
                        ),
                        'handlerCanRevise', COALESCE(revision_policy."handlerCanRevise", true),
                        'requestCanWithdraw', COALESCE(revision_policy."requestCanWithdraw", true),
                        'requestCanResubmit', COALESCE(revision_policy."requestCanResubmit", true),
                        'requestCanCancel', COALESCE(revision_policy."requestCanCancel", true),
                        'requestCanRevise', COALESCE(revision_policy."requestCanRevise", true),
                        'policyId', revision_policy."id",
                        'policyVersion', revision_policy."version"
                    )
                ),
                'report_correct', jsonb_build_object(
                    'businessActionKey', CASE WHEN plan."targetType" = 'personal' THEN 'work.tasks.goal.personal.report.correct' ELSE 'work.tasks.goal.department.report.correct' END,
                    'actionContractVersion', 1,
                    'workflowWhenDisabled', 'direct_write',
                    'policy', jsonb_build_object(
                        'businessActionKey', CASE WHEN plan."targetType" = 'personal' THEN 'work.tasks.goal.personal.report.correct' ELSE 'work.tasks.goal.department.report.correct' END,
                        'scopeType', COALESCE(correction_policy."scopeType", 'global'),
                        'scopeId', COALESCE(correction_policy."scopeId", ''),
                        'mode', COALESCE(correction_policy."mode", 'required'),
                        'flowType', COALESCE(correction_policy."flowType", 'approval'),
                        'separationPolicy', COALESCE(correction_policy."separationPolicy", 'auto_pass_if_authorized'),
                        'handlerSource', COALESCE(correction_policy."handlerSource", 'permission'),
                        'workflowNodes', COALESCE(
                            "_workspace_workflow_okr_try_jsonb"(correction_policy."workflowNodesJson"),
                            jsonb_build_array(jsonb_build_object(
                                'key', CASE WHEN plan."targetType" = 'personal' THEN 'work-task-goal-personal-report-correct' ELSE 'work-task-goal-department-report-correct' END,
                                'kind', 'approval',
                                'assignees', jsonb_build_array(jsonb_build_object('fieldKind', 'relationship', 'value', NULL::text)),
                                'approvalMode', 'any_one'
                            ))
                        ),
                        'handlerCanRevise', COALESCE(correction_policy."handlerCanRevise", true),
                        'requestCanWithdraw', COALESCE(correction_policy."requestCanWithdraw", true),
                        'requestCanResubmit', COALESCE(correction_policy."requestCanResubmit", true),
                        'requestCanCancel', COALESCE(correction_policy."requestCanCancel", true),
                        'requestCanRevise', COALESCE(correction_policy."requestCanRevise", true),
                        'policyId', correction_policy."id",
                        'policyVersion', correction_policy."version"
                    )
                )
            )
        )::text AS snapshot_json
    FROM "WorkPlan" AS plan
    LEFT JOIN "WorkflowPolicy" AS objective_policy
      ON objective_policy."businessActionKey" = CASE
          WHEN plan."targetType" = 'personal' THEN 'work.tasks.goal.personal.objective.submit'
          ELSE 'work.tasks.goal.department.objective.submit'
      END
     AND objective_policy."scopeType" = 'global'
     AND objective_policy."scopeId" = ''
    LEFT JOIN "WorkflowPolicy" AS report_policy
      ON report_policy."businessActionKey" = CASE
          WHEN plan."targetType" = 'personal' THEN 'work.tasks.goal.personal.report.submit'
          ELSE 'work.tasks.goal.department.report.submit'
      END
     AND report_policy."scopeType" = 'global'
     AND report_policy."scopeId" = ''
    LEFT JOIN "WorkflowPolicy" AS revision_policy
      ON revision_policy."businessActionKey" = CASE
          WHEN plan."targetType" = 'personal' THEN 'work.tasks.goal.personal.objective.revise'
          ELSE 'work.tasks.goal.department.objective.revise'
      END
     AND revision_policy."scopeType" = 'global'
     AND revision_policy."scopeId" = ''
    LEFT JOIN "WorkflowPolicy" AS correction_policy
      ON correction_policy."businessActionKey" = CASE
          WHEN plan."targetType" = 'personal' THEN 'work.tasks.goal.personal.report.correct'
          ELSE 'work.tasks.goal.department.report.correct'
      END
     AND correction_policy."scopeType" = 'global'
     AND correction_policy."scopeId" = ''
    LEFT JOIN LATERAL (
        SELECT policy.*
        FROM "WorkOkrControlPolicy" AS policy
        WHERE policy."cycleId" = plan."okrCycleId"
          AND (
              (policy."scopeType" = COALESCE(plan."okrControlScopeType", 'global')
               AND policy."scopeId" = COALESCE(plan."okrControlScopeId", ''))
              OR (policy."scopeType" = 'global' AND policy."scopeId" = '')
          )
        ORDER BY
            CASE WHEN policy."scopeType" = COALESCE(plan."okrControlScopeType", 'global')
                   AND policy."scopeId" = COALESCE(plan."okrControlScopeId", '')
                 THEN 0 ELSE 1 END,
            policy."id" DESC
        LIMIT 1
    ) AS control_policy ON TRUE
    WHERE plan."kind" = 'okr'
)
UPDATE "WorkPlan" AS plan
SET
    "governanceMode" = binding.governance_mode,
    "governanceRevision" = 1,
    "governanceActionKey" = binding.objective_action_key,
    "governanceWorkflowPolicyId" = binding.policy_id,
    "governanceWorkflowVersion" = binding.policy_version,
    "governanceActionContractVersion" = 1,
    "governanceOkrControlVersion" = 1,
    "governanceSnapshotJson" = binding.snapshot_json,
    "governanceBoundAt" = CURRENT_TIMESTAMP,
    "governanceBoundByUserId" = NULL,
    "governanceBindingSource" = 'legacy_inferred'
FROM plan_bindings AS binding
WHERE plan."id" = binding."id";

INSERT INTO "WorkPlanGovernanceEvent" (
    "workPlanId",
    "fromMode",
    "toMode",
    "fromSnapshotJson",
    "toSnapshotJson",
    "reason",
    "actorUserId"
)
SELECT
    plan."id",
    'legacy_inferred',
    plan."governanceMode",
    '{}',
    plan."governanceSnapshotJson",
    '历史计划治理模式迁移回填',
    NULL
FROM "WorkPlan" AS plan
WHERE plan."kind" = 'okr';

DROP FUNCTION "_workspace_workflow_okr_try_jsonb"(TEXT);

COMMIT;
