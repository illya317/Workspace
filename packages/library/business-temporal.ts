import { defineBusinessTemporalRegistration } from "@workspace/platform/contracts/business-temporal";

export const LIBRARY_DOCUMENT_REVISION_TEMPORAL = defineBusinessTemporalRegistration({
  key: "library.document-revision",
  ownerModuleKey: "library",
  resourceKey: "library.basicInfo",
  aggregate: "LibraryDocument",
  maturity: "partial",
  records: {
    authority: [
      {
        kind: "model",
        model: "LibraryDocument",
        fields: ["id", "documentUid", "stableKey", "currentVersionId", "version"],
        role: "anchor",
      },
      {
        kind: "model",
        model: "LibraryDocumentVersion",
        fields: ["id", "versionUid", "documentId", "versionNo", "storageChecksumSha256", "createdAt"],
        role: "revision",
      },
    ],
  },
  commands: ["publish", "supersede", "purge-draft"],
  ui: {
    asOf: "hidden",
    upcoming: false,
    history: true,
    recordState: true,
    sourceNavigation: true,
  },
  policy: {
    storage: "revision",
    granularity: "instant",
    futureChanges: "forbid",
    sameDayChanges: "sequenced",
    overlaps: "forbid",
    gaps: "allow",
    revision: "supersede",
    deletion: "draft-only",
  },
  notes: "稳定文档与版本分表已存在；接入统一 adapter 和 UI coverage 后再标记 implemented。",
});

export const LIBRARY_BUSINESS_TEMPORAL_REGISTRATIONS = [
  LIBRARY_DOCUMENT_REVISION_TEMPORAL,
] as const;
