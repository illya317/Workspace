import { defineBusinessTemporalRegistration } from "@workspace/platform/contracts/business-temporal";

export const WORK_PROJECT_MEMBERSHIP_TEMPORAL = defineBusinessTemporalRegistration({
  key: "work.project.membership",
  ownerModuleKey: "work",
  resourceKey: "work.projects",
  aggregate: "ProjectMembership",
  maturity: "partial",
  records: {
    authority: [{
      kind: "model",
      model: "EmployeeProject",
      fields: ["id", "membershipUid", "sequence", "employeeId", "projectId", "role", "startDate", "endDate", "recordState", "createdByChangeId", "terminalChangeId", "version"],
      role: "period",
    }, {
      kind: "model",
      model: "ProjectMembershipChange",
      fields: ["id", "changeUid", "idempotencyKey", "requestFingerprint", "membershipUid", "commandKind", "effectiveOn", "reason", "effectsJson", "recordedAt"],
      role: "event",
    }],
    supplementary: [{
      kind: "model",
      model: "EditHistory",
      fields: ["id", "entityType", "entityId", "version", "dataJson", "createdAt"],
      role: "audit",
    }],
  },
  commands: ["schedule", "correct", "end-date", "cancel-future"],
  ui: {
    asOf: "optional",
    upcoming: true,
    history: true,
    recordState: true,
    sourceNavigation: true,
  },
  policy: {
    storage: "effective-version",
    granularity: "date",
    futureChanges: "allow",
    sameDayChanges: "single",
    overlaps: "forbid",
    gaps: "allow",
    revision: "supersede",
    deletion: "end-date",
  },
  notes: "项目成员通过稳定 membershipUid、受控终结的有效期版本和不可变命令台账维护；命令台账保存请求指纹及 sourceBefore，角色变更/纠错新增版本，任何变更均可重建原始期间且不硬删历史。",
});

export const WORK_BUSINESS_TEMPORAL_REGISTRATIONS = [WORK_PROJECT_MEMBERSHIP_TEMPORAL] as const;
