import { defineBusinessTemporalRegistration } from "@workspace/platform/contracts/business-temporal";

export const ADMINISTRATION_CONTRACT_TEMPORAL = defineBusinessTemporalRegistration({
  key: "administration.contract",
  ownerModuleKey: "administration",
  resourceKey: "administration.contracts",
  aggregate: "Contract",
  maturity: "partial",
  records: {
    authority: [
      {
        kind: "model",
        model: "ContractRevision",
        fields: ["id", "contractId", "revisionNo", "recordState", "effectiveOn", "effectiveThrough", "snapshotJson", "sourceRevisionId", "supersededByRevisionId", "createIdempotencyKey", "createRequestFingerprint", "publishIdempotencyKey", "publishRequestFingerprint"],
        role: "revision",
      },
      {
        kind: "model",
        model: "ContractStateEvent",
        fields: ["id", "contractId", "axis", "fromState", "toState", "effectiveOn", "recordState", "reversesEventId", "idempotencyKey", "requestFingerprint"],
        role: "event",
      },
    ],
    supplementary: [
      {
        kind: "model",
        model: "Contract",
        fields: ["id", "contractUid", "currentRevisionId", "lifecycleStatus", "signatureStatus", "performanceStatus", "version"],
        role: "projection",
      },
      {
        kind: "model",
        model: "ContractRecord",
        fields: ["id", "contractId", "recordType", "occurredOn", "createdAt"],
        role: "evidence",
      },
      {
        kind: "model",
        model: "ContractAttachment",
        fields: ["id", "contractId", "attachmentUid", "uploadedAt", "removedAt"],
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
  commands: ["change", "schedule", "publish", "supersede", "append-event", "reverse"],
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
    deletion: "draft-only",
  },
  notes: "ContractRevision 是法定内容权威修订，ContractStateEvent 是三个状态轴权威事件；四类命令均持久化幂等键，Contract 仅保留当前查询投影。未来修订需在生效日显式发布，自动生效调度仍待实现。",
});

export const ADMINISTRATION_BUSINESS_TEMPORAL_REGISTRATIONS = [
  ADMINISTRATION_CONTRACT_TEMPORAL,
] as const;
