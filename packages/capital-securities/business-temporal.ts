import { defineBusinessTemporalRegistration } from "@workspace/platform/contracts/business-temporal";

import {
  OWNERSHIP_PROJECTOR_KEY,
  OWNERSHIP_PROJECTOR_VERSION,
  OWNERSHIP_REBUILD_ADAPTER_KEY,
} from "./ownership-projection-contract";

export const CAPITAL_OWNERSHIP_LEDGER_TEMPORAL = defineBusinessTemporalRegistration({
  key: "capital.ownership-ledger",
  ownerModuleKey: "capitalSecurities",
  resourceKey: "capitalSecurities.investors",
  aggregate: "OwnershipLedger",
  maturity: "partial",
  records: {
    authority: [
      {
        kind: "model",
        model: "ShareCapitalEvent",
        fields: ["id", "issuerCompanyId", "sequence", "eventType", "effectiveDate", "recordStatus", "supersedesEventId"],
        role: "event",
      },
      {
        kind: "model",
        model: "ShareCapitalTransaction",
        fields: ["id", "eventId", "sequence", "fromPartyId", "toPartyId", "registeredCapitalAmountYuan"],
        role: "event",
      },
      {
        kind: "model",
        model: "ShareCapitalSnapshotPosition",
        fields: ["id", "eventId", "sequence", "partyId", "registeredCapitalAmountYuan"],
        role: "event",
      },
    ],
    supplementary: [{
      kind: "model",
      model: "OwnershipInterest",
      fields: [
        "id",
        "ownerPartyId",
        "issuerCompanyId",
        "effectiveFrom",
        "effectiveTo",
        "recordStatus",
        "sourceEventId",
        "closedByEventId",
        "projectionRunId",
        "projectionGeneration",
      ],
      role: "projection",
    }, {
      kind: "model",
      model: "OwnershipProjectionRun",
      fields: [
        "id",
        "issuerCompanyId",
        "generation",
        "projectorKey",
        "projectorVersion",
        "ledgerHash",
        "projectedAt",
      ],
      role: "projection",
    }],
  },
  commands: ["append-event", "reverse"],
  ui: {
    asOf: "required",
    upcoming: true,
    history: true,
    recordState: true,
    sourceNavigation: true,
  },
  projection: {
    eventSource: "ShareCapitalEvent",
    projection: "OwnershipInterest",
    sourceEventField: "sourceEventId",
    generationField: "projectionGeneration",
    runModel: "OwnershipProjectionRun",
    projectorKey: OWNERSHIP_PROJECTOR_KEY,
    projectorVersion: OWNERSHIP_PROJECTOR_VERSION,
    rebuildAdapterKey: OWNERSHIP_REBUILD_ADAPTER_KEY,
  },
  policy: {
    storage: "event-projection",
    granularity: "date",
    futureChanges: "allow",
    sameDayChanges: "sequenced",
    overlaps: "forbid",
    gaps: "allow",
    correction: "reverse",
    deletion: "never",
  },
  notes: "按发行主体全量重建已统一收口并保存来源事件、关闭事件、generation、账本摘要和 projector 版本；财务并表范围已通过受控确认快照追加命令写入，通用股权事件追加/确认与冲销入口仍待建设。",
});

export const CAPITAL_BUSINESS_TEMPORAL_REGISTRATIONS = [
  CAPITAL_OWNERSHIP_LEDGER_TEMPORAL,
] as const;
