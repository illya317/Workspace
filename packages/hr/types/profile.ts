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
  displayKey?: string;
  required?: boolean;
  readOnly?: boolean;
  span?: "single" | "wide";
}

export interface EmployeeProfile {
  employee: EmployeeProfileEmployee;
  summary: EmployeeProfileSummary;
  employments: EmploymentRow[];
  contracts: ContractRow[];
  edps: EdpRow[];
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
  isNew?: boolean;
}

export interface ContractRow {
  id?: number;
  employmentId?: number;
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
  isNew?: boolean;
}

export interface EdpRow {
  id?: number;
  employeeId: number;
  departmentId: number | null;
  departmentName: string | null;
  positionId: number | null;
  positionName: string | null;
  isPrimary: boolean;
  startDate: string | null;
  endDate: string | null;
  reportTo: string | null;
  workPercent: string | null;
  isNew?: boolean;
}
