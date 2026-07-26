import { defineBusinessTemporalRegistration } from "@workspace/platform/contracts/business-temporal";

export const EXTERNAL_PARTY_ROLE_TEMPORAL = defineBusinessTemporalRegistration({
  key: "external.party-role",
  ownerModuleKey: "external",
  resourceKey: "external.customers",
  aggregate: "ExternalPartyRole",
  maturity: "partial",
  records: {
    authority: [
      {
        kind: "model",
        model: "ExternalPartyRole",
        fields: ["id", "partyId", "category", "code", "isActive", "availabilityVersion", "createdAt", "updatedAt"],
        role: "anchor",
      },
      {
        kind: "model",
        model: "ExternalPartyRolePeriod",
        fields: [
          "id", "roleId", "sequence", "validFrom", "validThrough", "recordState",
          "commandKind", "supersedesId", "idempotencyKey", "requestFingerprint", "reason", "recordedBy", "recordedAt",
        ],
        role: "period",
      },
    ],
    supplementary: [
      {
        kind: "model",
        model: "ExternalPartySourceMapping",
        fields: ["id", "roleId", "companyId", "sourceSystem", "sourceKey"],
        role: "evidence",
      },
      {
        kind: "model",
        model: "EditHistory",
        fields: ["id", "entityType", "entityId", "version", "dataJson", "createdAt"],
        role: "audit",
      },
    ],
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
    storage: "date-enabled",
    granularity: "date",
    futureChanges: "allow",
    sameDayChanges: "single",
    overlaps: "forbid",
    gaps: "allow",
    correction: "supersede",
    deletion: "end-date",
  },
  notes: "在线创建、as-of 读取、计划期间、更正、取消未来和 DELETE 终止均进入不可变期间 seam；旧 ERP 导入直写已 fail closed，但新的受治理导入 handler 尚未接入角色期间命令，纠错与取消权限也仍共用 update，因此 isActive 暂保留为兼容投影，成熟度为 partial。",
});

export const EXTERNAL_LEGAL_FACT_TEMPORAL = defineBusinessTemporalRegistration({
  key: "external.party-legal-fact",
  ownerModuleKey: "external",
  resourceKey: "external.customers",
  aggregate: "PartyLegalFactRevision",
  maturity: "partial",
  records: {
    authority: [{
      kind: "model",
      model: "PartyLegalFactRevision",
      fields: [
        "id", "partyId", "revision", "commandKind", "effectiveOn", "recordState",
        "supersedesId", "subjectType", "name", "fullName", "identityNumber",
        "legalRepresentative", "registeredCapital", "registeredAddress", "registeredDate",
        "sourceRegistryChangeId", "idempotencyKey", "requestFingerprint", "recordedBy", "recordedAt",
      ],
      role: "period",
    }],
    supplementary: [
      {
        kind: "model",
        model: "CompanyRegistryChange",
        fields: ["id", "companyId", "changeDate", "changeCategory", "contentBefore", "contentAfter"],
        role: "evidence",
      },
      {
        kind: "model",
        model: "Party",
        fields: ["id", "subjectType", "name", "fullName", "identityNumber", "legalRepresentative", "version"],
        role: "projection",
      },
      {
        kind: "model",
        model: "Company",
        fields: ["id", "partyId", "registeredCapital", "registeredAddress", "registeredDate", "version"],
        role: "projection",
      },
    ],
  },
  commands: ["change", "schedule", "correct", "cancel-future"],
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
    sameDayChanges: "sequenced",
    overlaps: "forbid",
    gaps: "forbid",
    correction: "supersede",
    deletion: "cancel-future",
  },
  notes: "External 与 Capital 公司治理已共用 Platform append-only legal-fact seam，并在同一事务刷新 Party/Company 当前投影；旧历史导入 execute 已 fail closed，待受治理批量导入 handler 与独立 correction 权限接入后再标记 implemented。",
});

export const EXTERNAL_BUSINESS_TEMPORAL_REGISTRATIONS = [
  EXTERNAL_PARTY_ROLE_TEMPORAL,
  EXTERNAL_LEGAL_FACT_TEMPORAL,
] as const;
