/** External owner facade over the shared Platform Party legal-fact authority seam. */
export {
  establishPartyLegalFactInTransaction,
  getPartyLegalFactState,
  getPartyLegalFactTimeline,
  partyLegalFactSnapshotFromCurrent as legalFactSnapshotFromCurrent,
  recordPartyLegalFact,
  recordPartyLegalFactInTransaction,
} from "@workspace/platform/server/party-legal-facts";

export type {
  PartyLegalFactSource,
  PartyLegalFactTransaction as LegalFactTransaction,
  RecordPartyLegalFactInput,
} from "@workspace/platform/server/party-legal-facts";
