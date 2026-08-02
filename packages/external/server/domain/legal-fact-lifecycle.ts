/**
 * External compatibility surface for the shared Party legal-fact primitive.
 * The canonical domain contract lives in Platform so every Party writer uses one authority seam.
 */
export {
  buildPartyLegalFactTimeline as buildLegalFactTimeline,
  normalizePartyLegalFactSnapshot as normalizeLegalFactSnapshot,
  PartyLegalFactLifecycleError as LegalFactLifecycleError,
  partyLegalFactSnapshotOf as snapshotOf,
  planPartyLegalFactCommand as planLegalFactCommand,
  resolvePartyLegalFactAsOf as resolveLegalFactAsOf,
} from "@workspace/platform/contracts/party-legal-facts";

export type {
  PartyLegalFactAppendPlan as LegalFactAppendPlan,
  PartyLegalFactCommandKind as LegalFactCommandKind,
  PartyLegalFactLifecycleCommand as LegalFactLifecycleCommand,
  PartyLegalFactRevisionLike as LegalFactRevisionLike,
  PartyLegalFactSnapshot as LegalFactSnapshot,
  PartyLegalFactTimelineItem as LegalFactTimelineItem,
  PlanPartyLegalFactCommandInput as PlanLegalFactCommandInput,
} from "@workspace/platform/contracts/party-legal-facts";
