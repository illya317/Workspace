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

export interface ExternalParty {
  id: number;
  category: ExternalPartyCategory;
  subjectType: ExternalPartySubjectType;
  relatedPartyType: ExternalPartyRelatedPartyType;
  code: string;
  name: string;
  fullName: string | null;
  classification: string | null;
  identityNumber: string | null;
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
  | "isActive"
> & { id?: number; version?: number };

export interface ExternalPartyListResponse {
  items: ExternalParty[];
  total: number;
  page: number;
  pageSize: number;
}
