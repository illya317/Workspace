export const EXTERNAL_PARTY_CATEGORIES = ["customer", "supplier"] as const;
export const EXTERNAL_PARTY_SUBJECT_TYPES = ["organization", "individual"] as const;
export const EXTERNAL_PARTY_RELATED_PARTY_TYPES = [
  "unrelated",
  "group",
  "joint_venture_associate",
  "investor_influence",
  "key_management_related",
  "other_related",
] as const;

export type ExternalPartyCategory = (typeof EXTERNAL_PARTY_CATEGORIES)[number];
export type ExternalPartySubjectType = (typeof EXTERNAL_PARTY_SUBJECT_TYPES)[number];
export type ExternalPartyRelatedPartyType = (typeof EXTERNAL_PARTY_RELATED_PARTY_TYPES)[number];

export interface ExternalPartyLegalFactTimelineItem {
  id: number;
  revision: number;
  commandKind: "establish" | "change" | "correction" | "cancel-future";
  effectiveOn: string;
  validThrough: string | null;
  temporalState: "past" | "current" | "upcoming" | "invalid";
  recordState: "confirmed" | "cancelled" | "superseded";
  name: string;
  fullName: string | null;
  identityNumber: string;
  legalRepresentative: string | null;
  registeredCapital: string | null;
  registeredAddress: string | null;
  registeredDate: string | null;
  reason: string | null;
  sourceLabel: string | null;
  sourceReference: string | null;
}

export interface ExternalPartyRoleAvailabilityTimelineItem {
  id: number;
  sequence: number;
  validFrom: string | null;
  validThrough: string | null;
  temporalState: "past" | "current" | "upcoming" | "invalid";
  recordState: "confirmed" | "cancelled" | "unknown" | "superseded";
  commandKind: "baseline" | "establish" | "schedule" | "end-date" | "cancel-future" | "correct";
  reason: string | null;
  supersedesId: number | null;
  authoritative: boolean;
  recordedAt: string;
}

export interface ExternalParty {
  id: number;
  /** 当前 L2/API 投影的角色；主体本身可以同时拥有多个角色。 */
  category: ExternalPartyCategory;
  roles: ExternalPartyCategory[];
  subjectType: ExternalPartySubjectType;
  relatedPartyType: ExternalPartyRelatedPartyType;
  code: string;
  name: string;
  fullName: string | null;
  classification: string | null;
  identityNumber: string;
  legalRepresentative: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  bankName: string | null;
  bankAccount: string | null;
  address: string | null;
  invoiceTitle: string | null;
  invoiceAddressPhone: string | null;
  settlementTerms: string | null;
  creditLimit: number | null;
  creditDays: number | null;
  taxRate: number | null;
  remark: string | null;
  isActive: boolean;
  availabilityVersion: number;
  availabilityTimeline: ExternalPartyRoleAvailabilityTimelineItem[];
  asOfDate: string;
  legalFactRevision: number;
  legalFactTimeline: ExternalPartyLegalFactTimelineItem[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type ExternalPartyDraft = Pick<
  ExternalParty,
  | "code"
  | "name"
  | "subjectType"
  | "relatedPartyType"
  | "fullName"
  | "classification"
  | "identityNumber"
  | "legalRepresentative"
  | "contactPerson"
  | "phone"
  | "email"
  | "bankName"
  | "bankAccount"
  | "address"
  | "invoiceTitle"
  | "invoiceAddressPhone"
  | "settlementTerms"
  | "creditLimit"
  | "creditDays"
  | "taxRate"
  | "remark"
> & {
  id?: number;
  version?: number;
  existingPartyId?: number | null;
  effectiveOn?: string;
  legalFactReason?: string | null;
  legalFactRevision?: number;
  availabilityFrom?: string | null;
  availabilityThrough?: string | null;
};

export interface ExternalPartyListResponse {
  items: ExternalParty[];
  total: number;
  page: number;
  pageSize: number;
  asOfDate: string;
  businessDate: string;
}
