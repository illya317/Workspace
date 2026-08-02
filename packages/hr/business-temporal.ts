import { defineBusinessTemporalRegistration } from "@workspace/platform/contracts/business-temporal";
import { EMPLOYMENT_AGREEMENT_BASELINE_REQUIRED_FIELDS } from "./employment-agreement-baseline-contract.mjs";

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

const EMPLOYEE_PERIOD_REVISION_SOURCE = {
  kind: "model",
  model: "EmployeePeriodRevision",
  fields: ["id", "employeeId", "entityType", "periodId", "expectedVersion", "beforeJson", "afterJson", "reason", "recordedByUserId", "recordedAt"],
  role: "evidence",
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
    revision: "audited-overwrite",
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
    supplementary: [EMPLOYEE_LIFECYCLE_EVENT_SOURCE, EMPLOYEE_PERIOD_REVISION_SOURCE, EDIT_HISTORY_SOURCE],
  },
  commands: ["schedule", "correct", "end-date", "cancel-future"],
  ui: EFFECTIVE_PERIOD_UI,
  policy: {
    storage: "effective-version",
    granularity: "date",
    futureChanges: "allow",
    retrospectiveChanges: "allow",
    sameDayChanges: "single",
    overlaps: "forbid",
    gaps: "allow",
    revision: "audited-overwrite",
    deletion: "end-date",
  },
  notes: "Employment 期间是读取事实源；禁止重叠、默认允许历史补录。普通编辑通过业务写入 Interface 自动记录版本、EditHistory 与 EmployeePeriodRevision，未来或追溯业务变化才进入显式 lifecycle command。数据库延期约束与流程 adapter 仍待闭环。",
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
        "allocationWeight",
        "version",
      ],
      role: "period",
    }],
    supplementary: [EMPLOYEE_LIFECYCLE_EVENT_SOURCE, EMPLOYEE_PERIOD_REVISION_SOURCE, EDIT_HISTORY_SOURCE],
  },
  commands: ["schedule", "correct", "end-date", "cancel-future"],
  ui: EFFECTIVE_PERIOD_UI,
  policy: {
    storage: "effective-version",
    granularity: "date",
    futureChanges: "allow",
    retrospectiveChanges: "allow",
    sameDayChanges: "single",
    overlaps: "by-slot",
    gaps: "allow",
    revision: "audited-overwrite",
    deletion: "cancel-future",
  },
  notes: "并行任职按槽位、正数投入权重和唯一主岗约束；折算占比按查询业务日从有效任职权重派生，不入库；默认允许历史补录，周期修订走独立 command、expected version、EditHistory 与 EmployeePeriodRevision 原因台账；未来取消仍需结构化 provenance。",
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
    revision: "supersede",
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
    revision: "supersede",
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
    revision: "supersede",
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
    revision: "supersede",
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
        fields: ["id", "agreementUid", "employmentId", "recordState", "isPrimary", "version", "currentPublishedRevisionId", "sourceKind", "sourceRef", "missingFieldsJson", "actualEndDate", "reason"],
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
        fields: ["id", "revisionUid", "agreementId", "revisionNo", "recordState", "changeKind", "contentJson", "supersedesRevisionId", "sourceKind", "sourceRef", "reason", "createdAt"],
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
  commands: ["change", "schedule", "correct", "end-date", "cancel-future", "supersede"],
  ui: {
    asOf: "required",
    upcoming: true,
    history: true,
    recordState: false,
    sourceNavigation: false,
    recordView: {
      presentation: "expandable-record-list",
      modulePath: "packages/hr/ui/profile/EmployeeProfileContractForm.ts",
      registrationBinding: "HR_EMPLOYMENT_AGREEMENT_TEMPORAL",
    },
  },
  baseline: {
    persistence: "preload-authority",
    missingRecordState: "confirm-unless-explicitly-inactive",
    missingValidFrom: "open-boundary-with-quality-marker",
    missingValidThrough: "open-boundary",
    missingAttributes: "null-with-nonblocking-quality-marker",
    missingFieldCompletion: "separate-patch-command",
    missingFieldPresentation: "inline-editable",
    knownFieldPresentation: "read-only",
    existingFactCorrection: "separate-audited-command",
    existingFactCorrectionPresentation: "explicit-mode",
    businessChange: "new-lifecycle-fact",
    requiredFields: EMPLOYMENT_AGREEMENT_BASELINE_REQUIRED_FIELDS,
    defaultQuery: "include-incomplete",
    exactBoundaryAutomation: "require-known-boundary",
    hardConflicts: "quarantine",
  },
  policy: {
    storage: "revision",
    granularity: "date",
    futureChanges: "allow",
    retrospectiveChanges: "allow",
    sameDayChanges: "single",
    overlaps: "allow",
    gaps: "allow",
    revision: "supersede",
    deletion: "never",
  },
  notes: "稳定 anchor、允许补录且允许提前续签重叠的含首尾日 Term、append-only Revision 与幂等命令台账已接入；历史 baseline 上线前预写正式表，缺失状态按有效、缺失开始/结束按开放边界，所有实际缺失字段登记数据质量，只有 requiredFields 缺失阻断依赖动作，非必填缺失只提示；补充缺失字段、纠正既有事实与现实业务变化必须使用互斥命令，旧 JSON 只作为迁移证据保留且不投影到业务 UI。",
});

export const HR_SOCIAL_INSURANCE_TEMPORAL = defineBusinessTemporalRegistration({
  key: "hr.employee.social-insurance",
  ownerModuleKey: "hr",
  resourceKey: "hr.roster",
  aggregate: "EmployeeSocialInsurancePeriod",
  maturity: "partial",
  records: {
    authority: [
      {
        kind: "model",
        model: "EmployeeSocialInsurancePeriod",
        fields: ["id", "periodUid", "employeeId", "insuranceStatus", "companyId", "companyNameSnapshot", "startMonth", "endMonth", "stopReason", "missingFieldsJson", "recordState", "sourceKind", "sourceRef", "version"],
        role: "period",
      },
      {
        kind: "model",
        model: "EmployeeSocialInsurancePeriodRevision",
        fields: ["id", "revisionUid", "periodId", "revisionNo", "changeKind", "beforeJson", "afterJson", "reason", "recordedBy", "recordedAt"],
        role: "revision",
      },
    ],
    supplementary: [{
      kind: "json-field",
      model: "Employment",
      field: "contracts",
      role: "legacy-source",
    }],
  },
  commands: ["change", "correct", "end-date"],
  ui: {
    asOf: "required",
    upcoming: true,
    history: true,
    recordState: false,
    sourceNavigation: false,
    recordView: {
      presentation: "expandable-record-list",
      modulePath: "packages/hr/ui/profile/EmployeeSocialInsuranceSection.tsx",
      registrationBinding: "HR_SOCIAL_INSURANCE_TEMPORAL",
    },
  },
  baseline: {
    persistence: "preload-authority",
    missingRecordState: "confirm-unless-explicitly-inactive",
    missingValidFrom: "open-boundary-with-quality-marker",
    missingValidThrough: "open-boundary",
    missingAttributes: "null-with-nonblocking-quality-marker",
    missingFieldCompletion: "separate-patch-command",
    missingFieldPresentation: "inline-editable",
    knownFieldPresentation: "read-only",
    existingFactCorrection: "separate-audited-command",
    existingFactCorrectionPresentation: "explicit-mode",
    businessChange: "new-lifecycle-fact",
    requiredFields: [],
    defaultQuery: "include-incomplete",
    exactBoundaryAutomation: "require-known-boundary",
    hardConflicts: "quarantine",
  },
  policy: {
    storage: "effective-version",
    granularity: "date",
    futureChanges: "allow",
    retrospectiveChanges: "allow",
    sameDayChanges: "single",
    overlaps: "allow",
    gaps: "allow",
    revision: "supersede",
    deletion: "never",
  },
  notes: "社保以显式状态和月份期间形成单线记录；标准记录表展示全部事实，选中行后通过通用 baseline mutation 配置原位补缺，已有事实只读，补充写入不可变修订。",
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
  HR_SOCIAL_INSURANCE_TEMPORAL,
] as const;
