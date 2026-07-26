import { defineBusinessTemporalRegistration } from "@workspace/platform/contracts/business-temporal";

const EFFECTIVE_PERIOD_UI = {
  asOf: "required",
  upcoming: true,
  history: true,
  recordState: true,
  sourceNavigation: false,
} as const;

const EDIT_HISTORY_SOURCE = {
  kind: "model",
  model: "EditHistory",
  fields: ["id", "entityType", "entityId", "version", "dataJson", "createdAt"],
  role: "audit",
} as const;

const EMPLOYEE_LIFECYCLE_EVENT_SOURCE = {
  kind: "model",
  model: "EmployeeLifecycleEvent",
  fields: ["id", "employeeId", "eventType", "effectiveDate", "detailsJson", "recordedAt"],
  role: "event",
} as const;

export const HR_EMPLOYEE_IDENTITY_TEMPORAL = defineBusinessTemporalRegistration({
  key: "hr.employee.identity",
  ownerModuleKey: "hr",
  resourceKey: "hr.roster",
  aggregate: "EmployeeIdentity",
  maturity: "partial",
  records: {
    authority: [{
      kind: "model",
      model: "Employee",
      fields: ["id", "employeeId", "name", "version"],
      role: "anchor",
    }],
    supplementary: [EDIT_HISTORY_SOURCE],
  },
  commands: ["change"],
  ui: {
    asOf: "hidden",
    upcoming: false,
    history: false,
    recordState: false,
    sourceNavigation: false,
  },
  policy: {
    storage: "current",
    granularity: "instant",
    futureChanges: "forbid",
    sameDayChanges: "sequenced",
    overlaps: "forbid",
    gaps: "allow",
    correction: "audited-overwrite",
    deletion: "never",
  },
  notes: "Employee 是稳定身份锚点；离职、账号停用和组织变化不删除或复制身份。",
});

export const HR_EMPLOYMENT_TEMPORAL = defineBusinessTemporalRegistration({
  key: "hr.employee.employment",
  ownerModuleKey: "hr",
  resourceKey: "hr.roster",
  aggregate: "EmployeeEmployment",
  maturity: "partial",
  records: {
    authority: [{
      kind: "model",
      model: "Employment",
      fields: ["id", "employeeId", "isActive", "joinDate", "leaveDate", "version"],
      role: "period",
    }],
    supplementary: [EMPLOYEE_LIFECYCLE_EVENT_SOURCE, EDIT_HISTORY_SOURCE],
  },
  commands: ["schedule", "correct", "end-date", "cancel-future"],
  ui: EFFECTIVE_PERIOD_UI,
  policy: {
    storage: "effective-version",
    granularity: "date",
    futureChanges: "allow",
    sameDayChanges: "single",
    overlaps: "forbid",
    gaps: "allow",
    correction: "audited-overwrite",
    deletion: "end-date",
  },
  notes: "Employment 期间已是读取事实源；纠错 provenance、幂等和数据库期间约束尚待闭环。",
});

export const HR_ASSIGNMENT_TEMPORAL = defineBusinessTemporalRegistration({
  key: "hr.employee.assignment",
  ownerModuleKey: "hr",
  resourceKey: "hr.roster",
  aggregate: "EmployeeAssignment",
  maturity: "partial",
  records: {
    authority: [{
      kind: "model",
      model: "EDP",
      fields: [
        "id",
        "employeeId",
        "reportingCompanyId",
        "departmentId",
        "positionId",
        "reportToPositionId",
        "isPrimary",
        "startDate",
        "endDate",
        "workPercent",
        "version",
      ],
      role: "period",
    }],
    supplementary: [EMPLOYEE_LIFECYCLE_EVENT_SOURCE, EDIT_HISTORY_SOURCE],
  },
  commands: ["schedule", "correct", "end-date", "cancel-future"],
  ui: EFFECTIVE_PERIOD_UI,
  policy: {
    storage: "effective-version",
    granularity: "date",
    futureChanges: "allow",
    sameDayChanges: "single",
    overlaps: "by-slot",
    gaps: "allow",
    correction: "audited-overwrite",
    deletion: "cancel-future",
  },
  notes: "并行任职按占比和唯一主岗约束；未来取消仍需结构化 provenance。",
});

export const HR_DEPARTMENT_TEMPORAL = defineBusinessTemporalRegistration({
  key: "hr.organization.department",
  ownerModuleKey: "hr",
  resourceKey: "hr.roster",
  aggregate: "DepartmentStructure",
  maturity: "partial",
  records: {
    authority: [{
      kind: "model",
      model: "Department",
      fields: ["id", "version"],
      role: "anchor",
    }, {
      kind: "model",
      model: "DepartmentEffectiveVersion",
      fields: ["id", "departmentId", "sequence", "validFrom", "validToExclusive", "recordState", "supersedesId", "sourceChangeId", "code", "name", "parentId", "managerPositionId"],
      role: "period",
    }],
    supplementary: [{
      kind: "model",
      model: "OrganizationStructureChange",
      fields: ["id", "aggregateType", "aggregateId", "commandKind", "effectiveOn", "expectedSequence", "idempotencyKey", "requestFingerprint", "reason", "effectManifestJson", "recordedAt"],
      role: "evidence",
    }, EDIT_HISTORY_SOURCE],
  },
  commands: ["schedule", "correct", "end-date", "cancel-future"],
  ui: EFFECTIVE_PERIOD_UI,
  policy: {
    storage: "effective-version",
    granularity: "date",
    futureChanges: "allow",
    sameDayChanges: "single",
    overlaps: "forbid",
    gaps: "forbid",
    correction: "supersede",
    deletion: "end-date",
  },
  notes: "DepartmentEffectiveVersion 与命令台账已接入主组织维护入口；Department 同名字段仅作当前业务日缓存，Platform organization-units 和旧编码维护入口仍待关闭后才能标记 implemented。",
});

export const HR_POSITION_TEMPORAL = defineBusinessTemporalRegistration({
  key: "hr.organization.position",
  ownerModuleKey: "hr",
  resourceKey: "hr.roster",
  aggregate: "PositionStructure",
  maturity: "partial",
  records: {
    authority: [{
      kind: "model",
      model: "Position",
      fields: ["id", "positionDescriptionId", "version"],
      role: "anchor",
    }, {
      kind: "model",
      model: "PositionEffectiveVersion",
      fields: ["id", "positionId", "sequence", "validFrom", "validToExclusive", "recordState", "supersedesId", "sourceChangeId", "code", "name", "departmentId", "reportToPositionId"],
      role: "period",
    }],
    supplementary: [{
      kind: "model",
      model: "OrganizationStructureChange",
      fields: ["id", "aggregateType", "aggregateId", "commandKind", "effectiveOn", "expectedSequence", "idempotencyKey", "requestFingerprint", "reason", "effectManifestJson", "recordedAt"],
      role: "evidence",
    }, EDIT_HISTORY_SOURCE],
  },
  commands: ["schedule", "correct", "end-date", "cancel-future"],
  ui: EFFECTIVE_PERIOD_UI,
  policy: {
    storage: "effective-version",
    granularity: "date",
    futureChanges: "allow",
    sameDayChanges: "single",
    overlaps: "forbid",
    gaps: "forbid",
    correction: "supersede",
    deletion: "end-date",
  },
  notes: "PositionEffectiveVersion 已接入岗位维护及组织编码级联；Position 同名字段是当前业务日缓存，旧 position-codes 入口关闭前保持 partial。",
});

export const HR_POSITION_REPORT_OVERRIDE_TEMPORAL = defineBusinessTemporalRegistration({
  key: "hr.organization.position-report-override",
  ownerModuleKey: "hr",
  resourceKey: "hr.roster",
  aggregate: "PositionReportOverride",
  maturity: "partial",
  records: {
    authority: [{
      kind: "model",
      model: "PositionReportOverride",
      fields: ["id", "positionId", "companyId", "departmentId", "version"],
      role: "anchor",
    }, {
      kind: "model",
      model: "PositionReportOverrideEffectiveVersion",
      fields: ["id", "positionReportOverrideId", "sequence", "validFrom", "validToExclusive", "recordState", "supersedesId", "sourceChangeId", "reportToPositionId", "headcount"],
      role: "period",
    }],
    supplementary: [{
      kind: "model",
      model: "OrganizationStructureChange",
      fields: ["id", "aggregateType", "aggregateId", "commandKind", "effectiveOn", "expectedSequence", "idempotencyKey", "requestFingerprint", "reason", "effectManifestJson", "recordedAt"],
      role: "evidence",
    }],
  },
  commands: ["schedule", "correct", "end-date", "cancel-future"],
  ui: EFFECTIVE_PERIOD_UI,
  policy: {
    storage: "effective-version",
    granularity: "date",
    futureChanges: "allow",
    sameDayChanges: "single",
    overlaps: "by-slot",
    gaps: "allow",
    correction: "supersede",
    deletion: "end-date",
  },
  notes: "特殊汇报整组保存已改为按稳定槽位追加版本；isActive 仅是当前业务日缓存，历史 EDP 保留稳定 anchor 引用。",
});

export const HR_POSITION_DESCRIPTION_TEMPORAL = defineBusinessTemporalRegistration({
  key: "hr.position-description",
  ownerModuleKey: "hr",
  resourceKey: "hr.roster",
  aggregate: "PositionDescription",
  maturity: "partial",
  records: {
    authority: [
      {
        kind: "model",
        model: "PositionDescription",
        fields: ["id", "createdBy", "createdAt"],
        role: "anchor",
      },
      {
        kind: "model",
        model: "PositionDescriptionRevision",
        fields: ["id", "revisionUid", "positionDescriptionId", "sequence", "effectiveDate", "details", "createdAt"],
        role: "revision",
      },
    ],
    supplementary: [EDIT_HISTORY_SOURCE],
  },
  commands: ["publish", "supersede", "purge-draft"],
  ui: {
    asOf: "optional",
    upcoming: true,
    history: true,
    recordState: true,
    sourceNavigation: false,
  },
  policy: {
    storage: "revision",
    granularity: "date",
    futureChanges: "allow",
    sameDayChanges: "single",
    overlaps: "forbid",
    gaps: "allow",
    correction: "supersede",
    deletion: "draft-only",
  },
  notes: "稳定 header + 数据库 append-only revision；编辑发布新修订，纠错以 supersedesRevisionId 显式关联。",
});

export const HR_EMPLOYMENT_AGREEMENT_TEMPORAL = defineBusinessTemporalRegistration({
  key: "hr.employment-agreement",
  ownerModuleKey: "hr",
  resourceKey: "hr.roster",
  aggregate: "EmploymentAgreement",
  maturity: "partial",
  records: {
    authority: [
      {
        kind: "model",
        model: "EmploymentAgreement",
        fields: ["id", "agreementUid", "employmentId", "recordState", "isPrimary", "version", "currentPublishedRevisionId", "sourceKind", "sourceRef", "reason"],
        role: "anchor",
      },
      {
        kind: "model",
        model: "EmploymentAgreementTerm",
        fields: ["id", "termUid", "agreementId", "sequence", "termKind", "effectiveFrom", "effectiveThrough", "recordState", "changeKind", "supersedesId", "sourceKind", "sourceRef", "reason"],
        role: "period",
      },
      {
        kind: "model",
        model: "EmploymentAgreementRevision",
        fields: ["id", "revisionUid", "agreementId", "revisionNo", "recordState", "contentJson", "supersedesRevisionId", "sourceKind", "sourceRef", "reason", "createdAt"],
        role: "revision",
      },
    ],
    supplementary: [
      {
        kind: "model",
        model: "EmploymentAgreementChange",
        fields: ["id", "employeeId", "agreementId", "commandKind", "idempotencyKey", "requestFingerprint", "expectedVersion", "effectManifestJson", "actorUserId", "recordedAt"],
        role: "audit",
      },
      {
        kind: "json-field",
        model: "Employment",
        field: "contracts",
        role: "legacy-source",
      },
    ],
  },
  commands: ["change", "schedule", "correct", "end-date", "cancel-future", "publish", "supersede"],
  ui: {
    asOf: "required",
    upcoming: true,
    history: true,
    recordState: true,
    sourceNavigation: true,
  },
  policy: {
    storage: "revision",
    granularity: "date",
    futureChanges: "allow",
    sameDayChanges: "single",
    overlaps: "forbid",
    gaps: "allow",
    correction: "supersede",
    deletion: "never",
  },
  notes: "稳定 anchor、含首尾日 Term、append-only Revision 与幂等命令台账已接入；legacy JSON 仅双读和 preflight，待受控迁移后移除 supplementary source。",
});

export const HR_BUSINESS_TEMPORAL_REGISTRATIONS = [
  HR_EMPLOYEE_IDENTITY_TEMPORAL,
  HR_EMPLOYMENT_TEMPORAL,
  HR_ASSIGNMENT_TEMPORAL,
  HR_DEPARTMENT_TEMPORAL,
  HR_POSITION_TEMPORAL,
  HR_POSITION_REPORT_OVERRIDE_TEMPORAL,
  HR_POSITION_DESCRIPTION_TEMPORAL,
  HR_EMPLOYMENT_AGREEMENT_TEMPORAL,
] as const;
