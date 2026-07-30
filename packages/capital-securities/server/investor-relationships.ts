import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { maskPartyIdentityNumber, type PartySubjectType } from "@workspace/platform/server/party-directory";
import { getTenantProfile } from "@workspace/platform/server/tenant-config";
import type {
  CaptableCompany,
  CaptableShareholderRow,
  FinancingRound,
  FinancingRoundContribution,
  InvestorDueDiligenceRecord,
  InvestorRelationshipView,
  InvestorShareholderProfileRecord,
  ShareCapitalEventRecord,
  ShareCapitalEventType,
  ShareholderPosition,
} from "../types";
import {
  projectEquityLedger,
  type EquityLedgerEventState,
  type EquityLedgerState,
} from "./domain/equity-ledger";
import { deriveCapitalEventValuation } from "./domain/capital-event-valuation";
import { buildOwnershipStructureGraph } from "./domain/ownership-structure-graph";
import { buildCaptableWorkbook } from "./investor-captable-workbook";
type InvestorRelationshipQuery = {
  issuerCompanyId?: number;
  asOf?: string;
};
export async function getInvestorRelationshipView(
  input: InvestorRelationshipQuery,
): Promise<InvestorRelationshipView> {
  const asOf = input.asOf ?? currentBusinessDate();
  const asOfDate = new Date(`${asOf}T00:00:00.000Z`);
  const allCompanies = await loadCompaniesForStructure();
  const companyItems: CaptableCompany[] = allCompanies.filter((company) => company.isActive).map((company) => ({
    id: company.id,
    code: company.code,
    name: company.party.name,
    fullName: company.party.fullName,
  }));
  const selectedCompany = companyItems.find((company) => company.id === input.issuerCompanyId)
    ?? companyItems.find((company) => company.code === getTenantProfile().finance.referenceCompanyCode)
    ?? companyItems[0]
    ?? null;
  if (!selectedCompany) return emptyView(asOf, companyItems);
  const [sourceEvents, shareholderProfiles, dueDiligenceRows] = await Promise.all([
    loadShareCapitalEvents(selectedCompany.id, asOfDate),
    prisma.investorShareholderProfile.findMany({
      where: { issuerCompanyId: selectedCompany.id },
      orderBy: [{ shareholderPartyId: "asc" }],
    }),
    prisma.investorDueDiligenceRecord.findMany({
      where: { issuerCompanyId: selectedCompany.id, isArchived: false },
      orderBy: [{ diligenceDate: "desc" }, { id: "desc" }],
    }),
  ]);
  const ledgerEvents = toLedgerEvents(sourceEvents);
  const projection = projectEquityLedger(ledgerEvents, asOfDate);
  const snapshotByEventId = new Map(projection.snapshots.map((snapshot) => [snapshot.eventId, snapshot]));
  const beforeByEventId = new Map<number, EquityLedgerState>();
  let previousState: EquityLedgerState = {
    holdings: new Map(),
    registeredCapitalYuan: 0,
    dataCompleteness: "complete",
    consolidatedByPartyId: null,
  };
  for (const snapshot of projection.snapshots) {
    beforeByEventId.set(snapshot.eventId, previousState);
    previousState = snapshot;
  }
  const partyById = collectParties(sourceEvents);
  const dateRangeByPartyId = collectPartyDateRanges(sourceEvents);
  const shareholders = buildShareholders(
    partyById,
    dateRangeByPartyId,
    projection.confirmedState,
    projection.projectedState,
    new Map(shareholderProfiles.map((profile) => [profile.shareholderPartyId, {
      id: profile.id,
      issuerCompanyId: profile.issuerCompanyId,
      shareholderPartyId: profile.shareholderPartyId,
      investorCategory: profile.investorCategory as InvestorShareholderProfileRecord["investorCategory"],
      contactName: profile.contactName,
      contactTitle: profile.contactTitle,
      phone: profile.phone,
      email: profile.email,
      address: profile.address,
      relationshipOwner: profile.relationshipOwner,
      relationshipStatus: profile.relationshipStatus as InvestorShareholderProfileRecord["relationshipStatus"],
      communicationPreference: profile.communicationPreference,
      notes: profile.notes,
      version: profile.version,
    } satisfies InvestorShareholderProfileRecord])),
  );
  const events: ShareCapitalEventRecord[] = sourceEvents.map((event) => {
    const snapshot = snapshotByEventId.get(event.id);
    const before = beforeByEventId.get(event.id);
    return {
      id: event.id,
      sequence: event.sequence,
      eventType: event.eventType as ShareCapitalEventType,
      eventName: event.eventName,
      effectiveDate: formatNullableDate(event.effectiveDate),
      effectiveDatePrecision: event.effectiveDatePrecision as "day" | "month" | "year" | "unknown",
      ledgerMode: event.ledgerMode as "transactions" | "confirmation_snapshot",
      dataCompleteness: event.dataCompleteness as "complete" | "party_list_only" | "known_interests_only",
      recordStatus: event.recordStatus as "confirmed" | "pending",
      registeredCapitalBeforeYuan: before?.registeredCapitalYuan ?? null,
      registeredCapitalAfterYuan: snapshot?.registeredCapitalYuan ?? null,
      sourceLabel: event.sourceLabel,
      sourceReference: event.sourceReference,
      notes: event.notes,
      transactions: event.transactions.map((transaction) => ({
        id: transaction.id,
        sequence: transaction.sequence,
        fromPartyId: transaction.fromPartyId,
        fromPartyName: transaction.fromParty?.name ?? null,
        toPartyId: transaction.toPartyId,
        toPartyName: transaction.toParty?.name ?? null,
        registeredCapitalAmountYuan: decimalNumber(transaction.registeredCapitalAmountYuan),
        considerationAmountYuan: decimalNullable(transaction.considerationAmountYuan),
        sourceReference: transaction.sourceReference,
        notes: transaction.notes,
      })),
      snapshotPositions: event.snapshotPositions.map((position) => ({
        id: position.id,
        sequence: position.sequence,
        partyId: position.partyId,
        partyName: position.party.name,
        registeredCapitalAmountYuan: decimalNullable(position.registeredCapitalAmountYuan),
        assertedShareRatio: position.assertedShareRatio,
        sourceReference: position.sourceReference,
        notes: position.notes,
      })),
    };
  });
  const captableRounds = events.map((event) => ({
    eventId: event.id,
    sequence: event.sequence,
    label: event.eventName,
    effectiveDate: event.effectiveDate,
    recordStatus: event.recordStatus,
    totalRegisteredCapitalYuan: event.registeredCapitalAfterYuan,
  }));
  const captableRows: CaptableShareholderRow[] = [...partyById.values()]
    .map((party) => ({
      partyId: party.id,
      name: party.name,
      positions: projection.snapshots.map((snapshot) => ({
        eventId: snapshot.eventId,
        isPresent: snapshot.holdings.has(party.id),
        subscribedCapitalYuan: snapshot.holdings.get(party.id)?.registeredCapitalAmountYuan ?? null,
        shareRatio: snapshot.holdings.get(party.id)?.shareRatio ?? null,
      })),
    }))
    .filter((row) => row.positions.some((position) => position.isPresent))
    .sort((left, right) => firstPositiveRound(left) - firstPositiveRound(right));
  const financingRounds = buildFinancingRounds(events);
  const dueDiligenceRecords = dueDiligenceRows.map((record): InvestorDueDiligenceRecord => ({
    id: record.id,
    issuerCompanyId: record.issuerCompanyId,
    investorPartyId: record.investorPartyId,
    investorOrganization: record.investorOrganization,
    visitorName: record.visitorName,
    visitorTitle: record.visitorTitle,
    phone: record.phone,
    email: record.email,
    diligenceDate: formatDate(record.diligenceDate),
    diligenceType: record.diligenceType as InvestorDueDiligenceRecord["diligenceType"],
    visitMethod: record.visitMethod as InvestorDueDiligenceRecord["visitMethod"],
    status: record.status as InvestorDueDiligenceRecord["status"],
    hostName: record.hostName,
    ndaStatus: record.ndaStatus as InvestorDueDiligenceRecord["ndaStatus"],
    dataRoomStatus: record.dataRoomStatus as InvestorDueDiligenceRecord["dataRoomStatus"],
    focusAreas: record.focusAreas,
    followUpAction: record.followUpAction,
    nextFollowUpDate: record.nextFollowUpDate ? formatDate(record.nextFollowUpDate) : null,
    notes: record.notes,
    version: record.version,
  }));
  const structureRootCompany = allCompanies.find(
    (company) => company.code === getTenantProfile().finance.referenceCompanyCode,
  ) ?? null;
  const ownershipStructure = structureRootCompany
    ? await buildRootOwnershipStructure({
        asOf,
        asOfDate,
        allCompanies,
        structureRootCompany,
        selectedCompany,
        selectedSourceEvents: sourceEvents,
      })
    : null;
  return {
    asOf,
    companies: companyItems,
    selectedCompany,
    shareholders,
    events,
    captableRounds,
    captableRows,
    financingRounds,
    dueDiligenceRecords,
    ownershipStructure,
    metrics: {
      shareholderCount: projection.confirmedState.holdings.size,
      registeredCapitalYuan: projection.confirmedState.registeredCapitalYuan,
      pendingEventCount: events.filter((event) => event.recordStatus === "pending").length,
    },
  };
}

async function loadCompaniesForStructure() {
  return prisma.company.findMany({
    include: { party: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
}

async function loadShareCapitalEvents(issuerCompanyId: number, asOfDate: Date) {
  return prisma.shareCapitalEvent.findMany({
    where: {
      issuerCompanyId,
      OR: [{ effectiveDate: null }, { effectiveDate: { lte: asOfDate } }],
    },
    include: {
      transactions: {
        include: { fromParty: true, toParty: true },
        orderBy: [{ sequence: "asc" }, { id: "asc" }],
      },
      snapshotPositions: {
        include: { party: true },
        orderBy: [{ sequence: "asc" }, { id: "asc" }],
      },
    },
    orderBy: [{ sequence: "asc" }, { id: "asc" }],
  });
}

type ShareCapitalSourceEvent = Awaited<ReturnType<typeof loadShareCapitalEvents>>[number];

function toLedgerEvents(sourceEvents: ShareCapitalSourceEvent[]): EquityLedgerEventState[] {
  return sourceEvents.map((event) => ({
    id: event.id,
    sequence: event.sequence,
    eventType: event.eventType as ShareCapitalEventType,
    eventName: event.eventName,
    effectiveDate: event.effectiveDate,
    ledgerMode: event.ledgerMode as "transactions" | "confirmation_snapshot",
    dataCompleteness: event.dataCompleteness as "complete" | "party_list_only" | "known_interests_only",
    recordStatus: event.recordStatus as "confirmed" | "pending",
    registeredCapitalCheckpointYuan: decimalNullable(event.registeredCapitalCheckpointYuan),
    consolidatedByPartyIdAfter: event.consolidatedByPartyIdAfter,
    supersedesEventId: event.supersedesEventId,
    sourceType: event.sourceType,
    sourceLabel: event.sourceLabel,
    sourceReference: event.sourceReference,
    transactions: event.transactions.map((transaction) => ({
      id: transaction.id,
      sequence: transaction.sequence,
      fromPartyId: transaction.fromPartyId,
      toPartyId: transaction.toPartyId,
      registeredCapitalAmountYuan: decimalNumber(transaction.registeredCapitalAmountYuan),
    })),
    snapshotPositions: event.snapshotPositions.map((position) => ({
      id: position.id,
      sequence: position.sequence,
      partyId: position.partyId,
      registeredCapitalAmountYuan: decimalNullable(position.registeredCapitalAmountYuan),
      assertedShareRatio: position.assertedShareRatio,
    })),
  }));
}

function companyForStructure(
  company: Awaited<ReturnType<typeof loadCompaniesForStructure>>[number],
) {
  return {
    id: company.id,
    partyId: company.partyId,
    code: company.code,
    name: company.party.name,
    fullName: company.party.fullName,
    description: company.description,
  };
}

async function buildRootOwnershipStructure(input: {
  asOf: string;
  asOfDate: Date;
  allCompanies: Awaited<ReturnType<typeof loadCompaniesForStructure>>;
  structureRootCompany: Awaited<ReturnType<typeof loadCompaniesForStructure>>[number];
  selectedCompany: CaptableCompany;
  selectedSourceEvents: ShareCapitalSourceEvent[];
}) {
  const [ownershipInterests, shareholderGroups, rootSourceEvents] = await Promise.all([
    prisma.ownershipInterest.findMany({ include: { owner: true } }),
    prisma.shareholderGroup.findMany({
      where: { issuerCompanyId: input.structureRootCompany.id },
      include: { memberships: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    input.selectedCompany.id === input.structureRootCompany.id
      ? Promise.resolve(input.selectedSourceEvents)
      : loadShareCapitalEvents(input.structureRootCompany.id, input.asOfDate),
  ]);
  const rootLedgerEvents = toLedgerEvents(rootSourceEvents);
  const rootProjection = projectEquityLedger(rootLedgerEvents, input.asOfDate);
  const rootPartyById = collectParties(rootSourceEvents);
  const rootDateRangeByPartyId = collectPartyDateRanges(rootSourceEvents);
  const rootShareholders = buildShareholders(
    rootPartyById,
    rootDateRangeByPartyId,
    rootProjection.confirmedState,
    rootProjection.projectedState,
  ).flatMap((shareholder) => shareholder.confirmedSubscribedCapitalYuan === null
    || shareholder.pendingCapitalDeltaYuan === null
    ? []
    : [{
        ...shareholder,
        confirmedSubscribedCapitalYuan: shareholder.confirmedSubscribedCapitalYuan,
        pendingCapitalDeltaYuan: shareholder.pendingCapitalDeltaYuan,
      }]);
  return buildOwnershipStructureGraph({
    asOf: input.asOf,
    rootCompany: companyForStructure(input.structureRootCompany),
    companies: input.allCompanies.map(companyForStructure),
    shareholders: rootShareholders,
    shareholderGroups: shareholderGroups.map((group) => ({
      id: group.id,
      groupKey: group.groupKey,
      label: group.label,
      sortOrder: group.sortOrder,
      memberships: group.memberships.map((membership) => ({
        partyId: membership.partyId,
        sortOrder: membership.sortOrder,
        effectiveFrom: membership.effectiveFrom,
        effectiveTo: membership.effectiveTo,
        recordStatus: membership.recordStatus as "confirmed" | "pending",
      })),
    })),
    totalRegisteredCapitalYuan: rootProjection.confirmedState.registeredCapitalYuan ?? 0,
    interests: ownershipInterests.map((interest) => ({
      id: interest.id,
      ownerPartyId: interest.ownerPartyId,
      ownerName: interest.owner.name,
      issuerCompanyId: interest.issuerCompanyId,
      shareRatio: interest.shareRatio,
      isConsolidated: interest.isConsolidated,
      effectiveFrom: interest.effectiveFrom,
      effectiveTo: interest.effectiveTo,
      recordStatus: interest.recordStatus as "confirmed" | "pending",
    })),
  });
}

function buildFinancingRounds(events: ShareCapitalEventRecord[]): FinancingRound[] {
  return events.flatMap((event) => {
    if (event.registeredCapitalBeforeYuan === null || event.registeredCapitalAfterYuan === null) return [];
    const valuation = deriveCapitalEventValuation({
      eventType: event.eventType,
      registeredCapitalBeforeYuan: event.registeredCapitalBeforeYuan,
      registeredCapitalAfterYuan: event.registeredCapitalAfterYuan,
      transactions: event.transactions,
    });
    if (!valuation) return [];

    const contributionByPartyId = new Map<number, FinancingRoundContribution>();
    for (const transaction of event.transactions) {
      if (
        transaction.toPartyId === null
        || transaction.toPartyName === null
        || transaction.considerationAmountYuan === null
        || transaction.considerationAmountYuan <= 0
      ) continue;
      const current = contributionByPartyId.get(transaction.toPartyId);
      contributionByPartyId.set(transaction.toPartyId, {
        partyId: transaction.toPartyId,
        partyName: transaction.toPartyName,
        registeredCapitalAmountYuan: (current?.registeredCapitalAmountYuan ?? 0)
          + transaction.registeredCapitalAmountYuan,
        considerationAmountYuan: (current?.considerationAmountYuan ?? 0)
          + transaction.considerationAmountYuan,
      });
    }

    return [{
      eventId: event.id,
      sequence: event.sequence,
      label: event.eventName,
      effectiveDate: event.effectiveDate,
      recordStatus: event.recordStatus,
      ...valuation,
      registeredCapitalBeforeYuan: event.registeredCapitalBeforeYuan,
      registeredCapitalAfterYuan: event.registeredCapitalAfterYuan,
      contributions: [...contributionByPartyId.values()],
    }];
  });
}

export async function exportInvestorCaptable(input: InvestorRelationshipQuery) {
  const view = await getInvestorRelationshipView(input);
  if (!view.selectedCompany) return new Response("没有可导出的公司", { status: 404 });
  const workbook = buildCaptableWorkbook(view);
  const fileName = `${safeFileName(view.selectedCompany.name)}-股权结构表-${view.asOf}.xlsx`;
  return new Response(new Uint8Array(workbook), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}

function buildShareholders(
  partyById: Map<number, PartyRecord>,
  dateRangeByPartyId: Map<number, { first: Date; latest: Date }>,
  confirmedState: EquityLedgerState,
  projectedState: EquityLedgerState,
  profileByPartyId: Map<number, InvestorShareholderProfileRecord> = new Map(),
): ShareholderPosition[] {
  const partyIds = new Set([...confirmedState.holdings.keys(), ...projectedState.holdings.keys()]);
  return [...partyIds]
    .map((partyId) => {
      const party = partyById.get(partyId);
      if (!party) return null;
      const confirmedHolding = confirmedState.holdings.get(partyId);
      const projectedHolding = projectedState.holdings.get(partyId);
      const confirmed = confirmedHolding ? confirmedHolding.registeredCapitalAmountYuan : 0;
      const projected = projectedHolding ? projectedHolding.registeredCapitalAmountYuan : 0;
      const pending = confirmed !== null && projected !== null ? projected - confirmed : null;
      const dates = dateRangeByPartyId.get(partyId);
      const subjectType: PartySubjectType = party.subjectType === "individual" ? "individual" : "organization";
      return {
        partyId,
        name: party.name,
        fullName: party.fullName,
        subjectType,
        identityNumberMasked: maskPartyIdentityNumber(party.identityNumber, subjectType),
        legalRepresentative: party.legalRepresentative,
        confirmedSubscribedCapitalYuan: confirmed,
        pendingCapitalDeltaYuan: pending,
        projectedSubscribedCapitalYuan: projected,
        shareRatio: confirmedHolding ? confirmedHolding.shareRatio : 0,
        firstEventDate: dates ? formatDate(dates.first) : null,
        latestEventDate: dates ? formatDate(dates.latest) : null,
        profile: profileByPartyId.get(partyId) ?? null,
      } satisfies ShareholderPosition;
    })
    .filter((item): item is ShareholderPosition => item !== null)
    .sort((left, right) => (right.confirmedSubscribedCapitalYuan ?? -1) - (left.confirmedSubscribedCapitalYuan ?? -1)
      || (right.projectedSubscribedCapitalYuan ?? -1) - (left.projectedSubscribedCapitalYuan ?? -1)
      || left.name.localeCompare(right.name, "zh-CN"));
}

type PartyRecord = {
  id: number;
  name: string;
  fullName: string | null;
  subjectType: string;
  identityNumber: string;
  legalRepresentative: string | null;
};

function collectParties(events: Array<{
  transactions: Array<{ fromParty: PartyRecord | null; toParty: PartyRecord | null }>;
  snapshotPositions: Array<{ party: PartyRecord }>;
}>) {
  const parties = new Map<number, PartyRecord>();
  for (const event of events) {
    for (const transaction of event.transactions) {
      if (transaction.fromParty) parties.set(transaction.fromParty.id, transaction.fromParty);
      if (transaction.toParty) parties.set(transaction.toParty.id, transaction.toParty);
    }
    for (const position of event.snapshotPositions) parties.set(position.party.id, position.party);
  }
  return parties;
}

function collectPartyDateRanges(events: Array<{
  effectiveDate: Date | null;
  transactions: Array<{ fromPartyId: number | null; toPartyId: number | null }>;
  snapshotPositions: Array<{ partyId: number }>;
}>) {
  const ranges = new Map<number, { first: Date; latest: Date }>();
  for (const event of events) {
    if (event.effectiveDate === null) continue;
    const partyIds = new Set([
      ...event.transactions.flatMap((transaction) => [transaction.fromPartyId, transaction.toPartyId]),
      ...event.snapshotPositions.map((position) => position.partyId),
    ].filter((id): id is number => id !== null));
    for (const partyId of partyIds) {
      const current = ranges.get(partyId);
      ranges.set(partyId, current
        ? {
            first: current.first < event.effectiveDate ? current.first : event.effectiveDate,
            latest: current.latest > event.effectiveDate ? current.latest : event.effectiveDate,
          }
        : { first: event.effectiveDate, latest: event.effectiveDate });
    }
  }
  return ranges;
}

function emptyView(asOf: string, companies: CaptableCompany[]): InvestorRelationshipView {
  return {
    asOf,
    companies,
    selectedCompany: null,
    shareholders: [],
    events: [],
    captableRounds: [],
    captableRows: [],
    financingRounds: [],
    dueDiligenceRecords: [],
    ownershipStructure: null,
    metrics: { shareholderCount: 0, registeredCapitalYuan: 0, pendingEventCount: 0 },
  };
}

function firstPositiveRound(row: CaptableShareholderRow) {
  return row.positions.findIndex((position) => (position.subscribedCapitalYuan ?? 0) > 0 || (position.shareRatio ?? 0) > 0);
}

function decimalNumber(value: Prisma.Decimal | number) {
  return typeof value === "number" ? value : value.toNumber();
}

function decimalNullable(value: Prisma.Decimal | number | null) {
  return value === null ? null : decimalNumber(value);
}

function currentBusinessDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: getTenantProfile().localization.businessTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function formatNullableDate(value: Date | null) {
  return value ? formatDate(value) : null;
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-");
}
