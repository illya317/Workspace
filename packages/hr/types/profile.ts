import type { BusinessTemporalPosition } from "@workspace/platform/contracts/business-temporal";

export type ProfileFieldType =
  | "text"
  | "date"
  | "boolean"
  | "number"
  | "textarea"
  | "fk"
  | "select"
  | "tags"
  | "major"
  | "school"
  | "professionalTitle"
  | "lunarBirthday"
  | "phone"
  | "chineseId"
  | "percent";

export interface ProfileField {
  key: string;
  label: string;
  type?: ProfileFieldType;
  booleanLabels?: { true: string; false: string; unset?: string };
  entity?: "company" | "department" | "employee" | "position" | "user";
  fkKey?: string;
  valueFrom?: "id" | "name" | "subtitle";
  activeOnly?: boolean;
  options?: string[];
  commonOptions?: string[];
  displayKey?: string;
  required?: boolean;
  readOnly?: boolean;
  span?: "single" | "wide";
}

export interface EmployeeProfile {
  asOfDate: string;
  employee: EmployeeProfileEmployee;
  summary: EmployeeProfileSummary;
  employments: EmploymentRow[];
  contracts: ContractRow[];
  edps: EdpRow[];
  lifecycleEvents: EmployeeLifecycleEventRow[];
}

export interface EmployeeProfileEmployee {
  id: number;
  employeeId: string;
  name: string;
  alias: string | null;
  gender: boolean | null;
  birthDate: string | null;
  ethnicity: string | null;
  hometown: string | null;
  politics: string | null;
  education: string | null;
  title: string | null;
  school: string | null;
  major: string | null;
  phone: string | null;
  workStartDate: string | null;
  idNumber: string | null;
  otherId: string | null;
  userId: number | null;
  userName: string | null;
  username: string | null;
}

export interface EmployeeProfileSummary {
  status: string;
  currentCompany: string | null;
  reportingCompanyId: number | null;
  reportingCompanyName: string | null;
  departmentId: number | null;
  departmentName: string | null;
  departmentPath: string | null;
  positionId: number | null;
  positionName: string | null;
}

export interface EmploymentRow {
  id?: number;
  employeeId: number;
  isActive: boolean;
  currentCompany: string | null;
  joinDate: string | null;
  leaveDate: string | null;
  leaveReason: string | null;
  leaveNote: string | null;
  officeLocation: string | null;
  personnelType: string | null;
  rank: string | null;
  title: string | null;
  temporalState: BusinessTemporalPosition;
}

export interface ContractRow {
  id: string;
  agreementUid: string | null;
  employmentId: number;
  employeeId: string;
  employeeName: string;
  company: string;
  isPrimary: boolean;
  isInsuredHere: boolean;
  insuranceStatus: string | null;
  legalRelation: string;
  contractType: string;
  employmentForm: string;
  firstContractStartDate: string | null;
  firstContractEndDate: string | null;
  secondContractStartDate: string | null;
  secondContractEndDate: string | null;
  thirdContractStartDate: string | null;
  thirdContractEndDate: string | null;
  permanentContractDate: string | null;
  confidentialityDate: string | null;
  nonCompeteDate: string | null;
  endDate: string | null;
  recordState: "draft" | "confirmed" | "cancelled" | "superseded" | "voided" | "unknown";
  temporalState: BusinessTemporalPosition;
  version: number | null;
  source: "normalized" | "legacy-json";
  migrationState: "normalized" | "legacy-read-only" | "legacy-ambiguous";
  currentRevisionUid: string | null;
  terms: EmploymentAgreementTermRow[];
  revisions: EmploymentAgreementRevisionRow[];
}

export interface EmploymentAgreementTermRow {
  termUid: string;
  sequence: number;
  termKind: "initial" | "renewal" | "permanent" | "legacy";
  effectiveFrom: string;
  effectiveThrough: string | null;
  recordState: "confirmed" | "cancelled" | "superseded" | "voided" | "unknown";
  temporalState: BusinessTemporalPosition;
  changeKind: string;
  reason: string | null;
}

export interface EmploymentAgreementRevisionRow {
  revisionUid: string;
  revisionNo: number;
  recordState: "draft" | "confirmed" | "cancelled" | "superseded" | "unknown";
  content: {
    company: string | null;
    insuranceStatus: string | null;
    legalRelation: string | null;
    contractType: string | null;
    employmentForm: string | null;
    confidentialityDate: string | null;
    nonCompeteDate: string | null;
  };
  supersedesRevisionUid: string | null;
  reason: string | null;
  createdAt: string;
}

export interface EdpRow {
  id?: number;
  employeeId: number;
  reportingCompanyId: number | null;
  reportingCompanyName?: string | null;
  departmentId: number | null;
  departmentName: string | null;
  departmentPath: string | null;
  positionId: number | null;
  positionReportOverrideId?: number | null;
  positionName: string | null;
  isPrimary: boolean;
  startDate: string | null;
  endDate: string | null;
  reportTo: string | null;
  reportToPositionId: number | null;
  workPercent: string | null;
  temporalState: BusinessTemporalPosition;
}

export type EmployeeLifecycleEventType =
  | "onboard"
  | "transfer"
  | "concurrent_assignment"
  | "reporting_change"
  | "offboard";

export interface EmployeeLifecycleEventRow {
  id: number;
  eventType: EmployeeLifecycleEventType;
  effectiveDate: string;
  temporalState: "scheduled" | "effective";
  recordState: "confirmed" | "cancelled" | "unknown";
  recordStateProvenance: "explicit" | "legacy_inferred" | "unknown";
  reason: string | null;
  details: Record<string, unknown>;
  recordedByUserId: number;
  recordedByName: string;
  recordedAt: string;
}
