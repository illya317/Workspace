export type GovernanceOrganizationLevel = 1 | 2 | 3;

export type GovernanceDepartmentDescription = {
  id: number;
  code: string;
  name: string;
  sourceFile: string;
  codeRaw: string | null;
  details: Record<string, unknown> | null;
};

export type GovernanceOrganization = {
  id: number;
  code: string;
  name: string;
  alias: string | null;
  hierarchyKind: "G";
  level: GovernanceOrganizationLevel;
  parentId: number | null;
  parentName: string | null;
  managerPositionId: number | null;
  managerPositionName: string | null;
  managerEmployeeIds: number[];
  managerEmployeeNames: string[];
  managerName: string | null;
  directPositions: number;
  totalPositions: number;
  directHeadcount: number;
  totalHeadcount: number;
  children: Array<{ id: number; name: string }>;
  descriptions: GovernanceDepartmentDescription[];
};

export type GovernancePositionSummary = {
  id: number;
  code: string;
  name: string;
  alias: string | null;
  departmentId: number | null;
  departmentName: string | null;
  headcount: number;
  reportTo: string | null;
  positionDescriptionId: number | null;
  positionDescriptionName: string | null;
  positionDescriptionCode: string | null;
  managerOfDepartmentIds: number[];
};

export type CompanyRecord = {
  id: number;
  partyId: number;
  partyVersion: number;
  code: string;
  name: string;
  fullName: string | null;
  description: string | null;
  registeredCapital: string | null;
  unifiedCode: string | null;
  bankName: string | null;
  registeredAddress: string | null;
  registeredDate: string | null;
  legalPerson: string | null;
  managementGroup: string;
  codePoolCode: string | null;
  isActive: boolean;
  sortOrder: number;
  version: number;
  registryChanges: CompanyRegistryChangeRecord[];
};

export type CompanyRegistryChangeRecord = {
  id: number;
  changeDate: string;
  changeCategory: "company_name" | "legal_representative" | "officers" | "ownership";
  changeItem: string;
  contentBefore: string | null;
  contentAfter: string | null;
  sourceCreatedDate: string | null;
  ownershipParticipants: CompanyRegistryOwnershipParticipantRecord[];
};

export type CompanyRegistryOwnershipParticipantRecord = {
  id: number;
  snapshotSide: "before" | "after";
  sequence: number;
  partyId: number | null;
  partyName: string | null;
  rawName: string;
  normalizedName: string;
  resolutionStatus: "resolved" | "unresolved";
};

export type OwnershipInterestRecord = {
  id: number;
  ownerPartyId: number;
  ownerName: string;
  issuerCompanyId: number;
  issuerCode: string;
  issuerName: string;
  shareRatio: number | null;
  isConsolidated: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  recordStatus: "confirmed" | "pending";
  changeLabel: string | null;
  sourceType: string | null;
  sourceLabel: string | null;
  sourceReference: string | null;
  version: number;
};

export type CaptableCompany = {
  id: number;
  code: string;
  name: string;
  fullName: string | null;
};

export type ShareCapitalEventType =
  | "incorporation"
  | "capital_increase"
  | "capital_reduction"
  | "transfer"
  | "buyback"
  | "adjustment"
  | "confirmation_snapshot";

export type ShareCapitalLedgerMode = "transactions" | "confirmation_snapshot";
export type ShareCapitalDataCompleteness = "complete" | "party_list_only" | "known_interests_only";

export type ShareCapitalTransactionRecord = {
  id: number;
  sequence: number;
  fromPartyId: number | null;
  fromPartyName: string | null;
  toPartyId: number | null;
  toPartyName: string | null;
  registeredCapitalAmountYuan: number;
  considerationAmountYuan: number | null;
  sourceReference: string | null;
  notes: string | null;
};

export type ShareCapitalSnapshotPositionRecord = {
  id: number;
  sequence: number;
  partyId: number;
  partyName: string;
  registeredCapitalAmountYuan: number | null;
  assertedShareRatio: number | null;
  sourceReference: string | null;
  notes: string | null;
};

export type ShareCapitalEventRecord = {
  id: number;
  sequence: number;
  eventType: ShareCapitalEventType;
  eventName: string;
  effectiveDate: string | null;
  effectiveDatePrecision: "day" | "month" | "year" | "unknown";
  ledgerMode: ShareCapitalLedgerMode;
  dataCompleteness: ShareCapitalDataCompleteness;
  recordStatus: "confirmed" | "pending";
  registeredCapitalBeforeYuan: number | null;
  registeredCapitalAfterYuan: number | null;
  sourceLabel: string | null;
  sourceReference: string | null;
  notes: string | null;
  transactions: ShareCapitalTransactionRecord[];
  snapshotPositions: ShareCapitalSnapshotPositionRecord[];
};

export type ShareholderPosition = {
  partyId: number;
  name: string;
  confirmedSubscribedCapitalYuan: number | null;
  pendingCapitalDeltaYuan: number | null;
  projectedSubscribedCapitalYuan: number | null;
  shareRatio: number | null;
  firstEventDate: string | null;
  latestEventDate: string | null;
};

export type CaptableRound = {
  eventId: number;
  sequence: number;
  label: string;
  effectiveDate: string | null;
  recordStatus: "confirmed" | "pending";
  totalRegisteredCapitalYuan: number | null;
};

export type CaptableRoundPosition = {
  eventId: number;
  isPresent: boolean;
  subscribedCapitalYuan: number | null;
  shareRatio: number | null;
};

export type CaptableShareholderRow = {
  partyId: number;
  name: string;
  positions: CaptableRoundPosition[];
};

export type FinancingRoundContribution = {
  partyId: number;
  partyName: string;
  registeredCapitalAmountYuan: number;
  considerationAmountYuan: number;
};

export type FinancingRound = {
  eventId: number;
  sequence: number;
  label: string;
  effectiveDate: string | null;
  recordStatus: "confirmed" | "pending";
  kind: "primary" | "secondary";
  registeredCapitalBeforeYuan: number;
  registeredCapitalAfterYuan: number;
  pricedRegisteredCapitalYuan: number;
  totalConsiderationYuan: number;
  pricePerRegisteredCapitalYuan: number;
  preMoneyValuationYuan: number;
  postMoneyValuationYuan: number;
  contributions: FinancingRoundContribution[];
};

export type OwnershipStructureNodeRole = "focus" | "shareholder" | "subsidiary" | "co_owner";

export type OwnershipStructureNode = {
  key: string;
  entityPartyId: number;
  companyId: number | null;
  label: string;
  subtitle: string | null;
  role: OwnershipStructureNodeRole;
  layoutOrder?: number;
};

export type OwnershipStructureGroup = {
  key: string;
  label: string;
  memberNodeKeys: string[];
  shareRatio: number;
  previousShareRatio: number | null;
  recordStatus: "confirmed" | "pending";
  layoutOrder: number;
};

export type OwnershipStructureEdge = {
  key: string;
  source: string;
  target: string;
  shareRatio: number | null;
  previousShareRatio: number | null;
  recordStatus: "confirmed" | "pending";
  relationType: "share_capital" | "ownership_interest";
  isConsolidated: boolean;
};

export type OwnershipStructureGraph = {
  asOf: string;
  rootCompanyId: number;
  rootPartyId: number;
  rootNodeKey: string;
  groups: OwnershipStructureGroup[];
  nodes: OwnershipStructureNode[];
  edges: OwnershipStructureEdge[];
};

export type InvestorRelationshipView = {
  asOf: string;
  companies: CaptableCompany[];
  selectedCompany: CaptableCompany | null;
  shareholders: ShareholderPosition[];
  events: ShareCapitalEventRecord[];
  captableRounds: CaptableRound[];
  captableRows: CaptableShareholderRow[];
  financingRounds: FinancingRound[];
  ownershipStructure: OwnershipStructureGraph | null;
  metrics: {
    shareholderCount: number;
    registeredCapitalYuan: number | null;
    pendingEventCount: number;
  };
};
