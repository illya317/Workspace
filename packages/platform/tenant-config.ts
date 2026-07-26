import type { TenantPermissionReviewPolicy } from "./permission-review-policy";

export type TenantCompanySeed = {
  code: string;
  name: string;
  managementGroup: string;
  codePoolCode: string | null;
  isActive: boolean;
  sortOrder: number;
};

export type TenantHrProfessionalTitleOption = {
  series: string;
  levels: Array<{ level: string; title: string }>;
};

export type TenantAgentWorkforceBinding = {
  runtimeKind: string;
  interactive: boolean;
  capabilityKeys: string[];
  instructions: string;
};

export type TenantAgentWorkforceMember = {
  employeeId: string;
  displayName: string;
  username: string;
  profileKey: string;
  roleName: string;
  positionCode: string;
  responsibilities: string;
  workspaceResourceGrants: Array<{ resourceKey: string; actions: string[] }>;
  legacyAllowedToolKeys: string[];
  runtimeBindings: TenantAgentWorkforceBinding[];
};

export type TenantAgentWorkforceConfig = {
  lockName: string;
  provisionerLedgerSource: string;
  managedWorkspaceResourceGrants: Array<{ resourceKey: string; actions: string[] }>;
  workforce: TenantAgentWorkforceMember[];
};

export type TenantCompanyDocumentConfig = {
  key: string;
  title: string;
  description: string;
  format: "office" | "paper";
  source: "tenant-file" | "permission-actions";
  file: string;
};

export type TenantProfile = {
  version: 1;
  key: string;
  files: {
    companies: string;
    agentWorkforce: string;
    permissionReview: string;
    financeImports: string;
    productNameAliases: string;
    cnbRelease: string;
    hrEthnicities: string;
    hrProfessionalTitles: string;
    hrSchoolWhitelist: string;
  };
  directories: {
    qcTemplateSnapshots: string;
  };
  identity: {
    appName: string;
    companyName: string;
    appDescription: string;
  };
  localization: {
    businessTimeZone: string;
  };
  library: {
    generatorCategories: Record<string, { code: string; name: string }>;
  };
  organization: {
    managementGroups: { default: string; regulated: string };
    operatingCommittee: {
      departmentCode: string;
      departmentName: string;
      executivePositionNames: string[];
    };
    administrativeDepartmentCodes: string[];
    implicitAllAdminEmployeeIds: string[];
    implicitGrantDepartmentKeywords: string[];
  };
  finance: {
    referenceCompanyCode: string;
    defaultLedgerCompanyCode: string;
    consolidationCompanyCodes: string[];
    countryReportProfiles: Array<{
      key: string;
      companyCodes: string[];
      prefixSet: "chn" | "can";
    }>;
    defaultAnalysisYear: number;
    openingBalanceBaselineYear: number;
  };
  work: {
    companyProjectCodePrefix: string;
    companyProjectSequenceStart: number;
    companyProjectSequenceEnd: number;
    otherProjectSequenceStart: number;
    companyProjectSequenceWidth: number;
    departmentProjectSequenceWidth: number;
  };
  hr: {
    options: {
      educations: string[];
      politics: string[];
      attendanceTypes: string[];
      officeLocations: string[];
      legalRelations: string[];
      contractTypes: string[];
      employmentForms: string[];
      insuranceStatuses: string[];
      insuranceStatusMapping: { insured: string; uninsured: string };
      personnelTypes: string[];
      virtualEmployeePersonnelType: string;
      leaveReasons: string[];
      ranks: string[];
      employmentTitles: string[];
    };
    optionAliases: {
      ethnicities: Record<string, string>;
      politics: Record<string, string>;
      educations: Record<string, string>;
    };
    positionDescriptionOptions: {
      educationRequirements: string[];
      defaultEducationRequirement: string;
      salaryTypes: string[];
      workSchedules: string[];
      workAreas: string[];
      environmentFactors: string[];
    };
    roster: {
      primaryManagementGroup: string;
      secondaryManagementGroup: string;
      secondaryDepartmentFieldKey: string;
      secondaryDepartmentLabel: string;
      secondaryPositionFieldKey: string;
      secondaryPositionLabel: string;
      excludedEmploymentTitles: string[];
    };
  };
  docs: {
    companyDocuments: TenantCompanyDocumentConfig[];
    hrPositionDescriptionDepartment: { code: string; name: string };
    qcDepartment: { code: string; name: string };
    officialQcProductKeys: string[];
    standardTemplateAliases: Record<string, string>;
    resultSuffixUpgradeRules: Array<{ productKey: string; fieldKeyPattern: string }>;
    formulaRules: { dryingWeightMultipliers: Record<string, number> };
  };
  agent: {
    department: { code: string; name: string };
    parentPosition: { code: string; name: string };
  };
};

export type TenantHrCatalogs = {
  ethnicities: string[];
  commonEthnicities: string[];
  professionalTitleGroups: TenantHrProfessionalTitleOption[];
  professionalTitleAliases: Record<string, string | null>;
  specialSchools: Array<{ name: string; label?: string; aliases?: string[] }>;
};

export type TenantFinanceImportConfig = {
  cashFlowCompanyAliases: Record<string, string>;
  readableSourceSeries: Array<{
    companyCode: string;
    companyName: string;
    sourceSystem: "T6" | "TPLUS";
    sourceLedger?: string;
    sourceDatabase?: string;
    startYear: number;
    endYear: number;
    mappingMode: "recurring" | "historical";
    continuationOf?: string;
  }>;
};

export type TenantRuntimeConfig = {
  profile: TenantProfile;
  companies: TenantCompanySeed[];
  hrCatalogs: TenantHrCatalogs;
  agentWorkforce: TenantAgentWorkforceConfig;
  permissionReview: TenantPermissionReviewPolicy;
  financeImports: TenantFinanceImportConfig;
};

export type TenantPublicConfig = Pick<TenantProfile, "key" | "identity" | "localization" | "organization" | "finance" | "work" | "hr"> & {
  brand: { logoPath: string };
  docs: Omit<TenantProfile["docs"], "companyDocuments">;
  hrCatalogs: TenantHrCatalogs;
};
