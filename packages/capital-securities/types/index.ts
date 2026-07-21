export interface Investor {
  id: number;
  name: string;
  contact?: string;
  type?: string;
  remark?: string;
}

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
  code: string;
  name: string;
  fullName: string | null;
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
};

export type CompanyRelationRecord = {
  id: number;
  parentId: number;
  parentName: string;
  childId: number;
  childName: string;
  shareRatio: number | null;
  isConsolidated: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  version: number;
};
