import "server-only";

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { TenantPermissionReviewPolicy } from "../permission-review-policy";
import { PERMISSION_ACTION_REGISTRY_KEYS as PERMISSION_ACTION_KEYS } from "../action-registry";
import type {
  TenantAgentWorkforceConfig,
  TenantCompanySeed,
  TenantHrCatalogs,
  TenantFinanceImportConfig,
  TenantProfile,
  TenantPublicConfig,
  TenantRuntimeConfig,
} from "../tenant-config";

const nonEmptyString = z.string().trim().min(1);
const stringList = z.array(nonEmptyString).min(1);
const regexString = nonEmptyString.refine((value) => {
  try {
    new RegExp(value);
    return true;
  } catch {
    return false;
  }
}, "must be a valid regular expression");
const timeZoneString = nonEmptyString.refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, "must be a valid IANA time zone");
const relativeConfigPath = nonEmptyString.refine((value) => !path.isAbsolute(value), "must be relative to WORKSPACE_CONFIG_DIR");
const companyDocumentSchema = z.object({
  key: nonEmptyString.regex(/^[a-z][a-z0-9-]*$/, "must be a stable lowercase key"),
  title: nonEmptyString,
  description: nonEmptyString,
  format: z.enum(["office", "paper"]),
  source: z.enum(["tenant-file", "permission-actions", "api-agent-guide", "agent-doc-catalog", "product-guide"]),
  file: relativeConfigPath,
}).superRefine((value, context) => {
  if (value.source !== "tenant-file" && value.format !== "paper") {
    context.addIssue({
      code: "custom",
      path: ["format"],
      message: `${value.source} must use paper format`,
    });
  }
  if (value.source === "tenant-file" && value.format !== "office") {
    context.addIssue({ code: "custom", path: ["format"], message: "tenant-file company documents must use office format" });
  }
});

const companySchema = z.object({
  code: nonEmptyString,
  name: nonEmptyString,
  aliases: z.array(nonEmptyString).default([]),
  managementGroup: nonEmptyString,
  codePoolCode: nonEmptyString.nullable(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
});

const profileSchema = z.object({
  version: z.literal(1),
  key: nonEmptyString,
  files: z.object({
    companies: relativeConfigPath,
    agentWorkforce: relativeConfigPath,
    permissionReview: relativeConfigPath,
    financeImports: relativeConfigPath,
    productNameAliases: relativeConfigPath,
    hrEthnicities: relativeConfigPath,
    hrProfessionalTitles: relativeConfigPath,
    hrSchoolWhitelist: relativeConfigPath,
  }),
  directories: z.object({
    qcTemplateSnapshots: relativeConfigPath,
  }),
  identity: z.object({ appName: nonEmptyString, companyName: nonEmptyString, appDescription: nonEmptyString }),
  localization: z.object({ businessTimeZone: timeZoneString }),
  library: z.object({
    generatorCategories: z.record(z.string(), z.object({ code: nonEmptyString, name: nonEmptyString })),
  }),
  organization: z.object({
    managementGroups: z.object({ default: nonEmptyString, regulated: nonEmptyString }),
    operatingCommittee: z.object({
      departmentCode: nonEmptyString,
      departmentName: nonEmptyString,
      executivePositionNames: stringList,
    }),
    administrativeDepartmentCodes: stringList,
    implicitAllAdminEmployeeIds: stringList,
    implicitGrantDepartmentKeywords: stringList,
  }),
  finance: z.object({
    referenceCompanyCode: nonEmptyString,
    defaultLedgerCompanyCode: nonEmptyString,
    consolidationCompanyCodes: stringList,
    countryReportProfiles: z.array(z.object({
      key: nonEmptyString,
      companyCodes: stringList,
      prefixSet: z.enum(["chn", "can"]),
    })),
    defaultAnalysisYear: z.number().int().min(2000).max(2200),
    openingBalanceBaselineYear: z.number().int().min(2000).max(2200),
  }),
  financeConsolidationPolicies: z.object({
    retainedEarningsOpeningBalances: z.array(z.object({
      key: nonEmptyString,
      foreignCompanyCode: nonEmptyString,
      openingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      presentationCurrencyCode: nonEmptyString,
      openingAmount: z.number().finite(),
      evidence: nonEmptyString,
    })),
    cutoverBaselines: z.array(z.object({
      key: nonEmptyString,
      foreignCompanyCode: nonEmptyString,
      baselineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      parentCompanyCode: nonEmptyString,
      parentLongTermInvestmentAmount: z.number().finite(),
      presentationCurrencyCode: nonEmptyString,
      equityComponents: z.array(z.object({
        lineCode: z.enum(["paidInCapital", "otherEquityInstruments", "capitalReserve", "treasuryStock", "otherComprehensiveIncome", "surplusReserve", "undistributedProfit"]),
        amount: z.number().finite(),
      })).min(1),
      amountExplanationQueries: z.array(z.object({
        key: nonEmptyString,
        classification: z.literal("parentInvestmentOpeningAdjustment"),
        sourceCompanyCode: nonEmptyString,
        targetAmount: z.string().regex(/^-?\d+(?:\.\d+)?$/),
        currencyCode: nonEmptyString,
        dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        accountHints: stringList,
        evidence: nonEmptyString,
      })).default([]),
      historicalDifferenceLineCode: z.enum(["capitalReserve", "undistributedProfit"]),
      evidence: nonEmptyString,
    })).default([]),
  }).optional(),
  work: z.object({
    companyProjectCodePrefix: nonEmptyString,
    companyProjectSequenceStart: z.number().int().positive(),
    companyProjectSequenceEnd: z.number().int().positive(),
    otherProjectSequenceStart: z.number().int().positive(),
    companyProjectSequenceWidth: z.number().int().positive(),
    departmentProjectSequenceWidth: z.number().int().positive(),
  }),
  hr: z.object({
    options: z.object({
      educations: stringList,
      politics: stringList,
      attendanceTypes: stringList,
      officeLocations: stringList,
      legalRelations: stringList,
      contractTypes: stringList,
      employmentForms: stringList,
      insuranceStatuses: stringList,
      insuranceStatusMapping: z.object({ insured: nonEmptyString, uninsured: nonEmptyString }),
      personnelTypes: stringList,
      virtualEmployeePersonnelType: nonEmptyString,
      leaveReasons: stringList,
      ranks: stringList,
      employmentTitles: stringList,
    }).superRefine((value, context) => {
      for (const [key, status] of Object.entries(value.insuranceStatusMapping)) {
        if (!value.insuranceStatuses.includes(status)) {
          context.addIssue({ code: "custom", path: ["insuranceStatusMapping", key], message: "must be listed in insuranceStatuses" });
        }
      }
    }),
    optionAliases: z.object({
      ethnicities: z.record(z.string(), nonEmptyString),
      politics: z.record(z.string(), nonEmptyString),
      educations: z.record(z.string(), nonEmptyString),
    }),
    positionDescriptionOptions: z.object({
      educationRequirements: stringList,
      defaultEducationRequirement: nonEmptyString,
      salaryTypes: stringList,
      workSchedules: stringList,
      workAreas: stringList,
      environmentFactors: stringList,
    }).refine(
      (value) => value.educationRequirements.includes(value.defaultEducationRequirement),
      { path: ["defaultEducationRequirement"], message: "must be listed in educationRequirements" },
    ),
    roster: z.object({
      primaryManagementGroup: nonEmptyString,
      secondaryManagementGroup: nonEmptyString,
      secondaryDepartmentFieldKey: nonEmptyString,
      secondaryDepartmentLabel: nonEmptyString,
      secondaryPositionFieldKey: nonEmptyString,
      secondaryPositionLabel: nonEmptyString,
      excludedEmploymentTitles: z.array(nonEmptyString),
    }),
  }),
  docs: z.object({
    companyDocuments: z.array(companyDocumentSchema).default([]),
    hrPositionDescriptionDepartment: z.object({ code: nonEmptyString, name: nonEmptyString }),
    qcDepartment: z.object({ code: nonEmptyString, name: nonEmptyString }),
    officialQcProductKeys: z.array(nonEmptyString),
    standardTemplateAliases: z.record(z.string(), nonEmptyString),
    resultSuffixUpgradeRules: z.array(z.object({ productKey: nonEmptyString, fieldKeyPattern: regexString })),
    formulaRules: z.object({ dryingWeightMultipliers: z.record(z.string(), z.number().positive()) }),
  }),
  agent: z.object({
    department: z.object({ code: nonEmptyString, name: nonEmptyString }),
    parentPosition: z.object({ code: nonEmptyString, name: nonEmptyString }),
  }),
});

const professionalTitleLevelSchema = z.object({ level: nonEmptyString, title: nonEmptyString });
const workforceGrantSchema = z.object({ resourceKey: nonEmptyString, actions: stringList });
const financeImportsSchema = z.object({
  cashFlowCompanyAliases: z.record(z.string(), nonEmptyString),
  readableSourceSeries: z.array(z.object({
    companyCode: nonEmptyString,
    companyName: nonEmptyString,
    sourceSystem: z.enum(["T6", "TPLUS"]),
    sourceLedger: nonEmptyString.optional(),
    sourceDatabase: nonEmptyString.optional(),
    startYear: z.number().int().min(2000).max(2200),
    endYear: z.number().int().min(2000).max(2200),
    mappingMode: z.enum(["recurring", "historical"]),
    continuationOf: nonEmptyString.optional(),
  }).refine((value) => value.endYear >= value.startYear, "endYear must be after startYear")),
});
const agentWorkforceSchema = z.object({
  lockName: nonEmptyString,
  provisionerLedgerSource: nonEmptyString,
  managedWorkspaceResourceGrants: z.array(workforceGrantSchema),
  workforce: z.array(z.object({
    employeeId: nonEmptyString,
    displayName: nonEmptyString,
    username: nonEmptyString,
    profileKey: nonEmptyString,
    roleName: nonEmptyString,
    positionCode: nonEmptyString,
    responsibilities: nonEmptyString,
    workspaceResourceGrants: z.array(workforceGrantSchema),
    legacyAllowedToolKeys: z.array(nonEmptyString),
    runtimeBindings: z.array(z.object({
      runtimeKind: nonEmptyString,
      interactive: z.boolean(),
      capabilityKeys: z.array(nonEmptyString),
      instructions: nonEmptyString,
    })).min(1),
  })).min(1),
});

const permissionActionKeySchema = z.enum(PERMISSION_ACTION_KEYS);
const permissionReviewGrantSchema = z.object({
  subjectType: z.enum(["user", "position", "department"]),
  subjectKey: nonEmptyString,
  resourceKey: nonEmptyString,
  actionKey: permissionActionKeySchema,
  scopeId: nonEmptyString.nullable(),
});
const permissionReviewSchema = z.object({
  version: z.literal(1),
  schedule: z.object({
    dailyAt: nonEmptyString.regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "must use HH:mm"),
    timeZone: timeZoneString,
  }),
  actorUsername: nonEmptyString,
  notificationRecipientUsernames: stringList,
  remindOpenAfterHours: z.number().int().min(1).max(168),
  expectedResourceTopology: z.array(z.object({
    resourceKey: nonEmptyString,
    parentResourceKey: nonEmptyString.nullable(),
  })),
  expectedGrants: z.array(permissionReviewGrantSchema),
  expectedDirectGrantUserRoles: z.array(z.object({
    username: nonEmptyString,
    positionCodes: z.array(nonEmptyString),
    departmentCodes: z.array(nonEmptyString),
  })),
  expectedGrantSubjectAssignments: z.array(z.object({
    subjectType: z.enum(["position", "department"]),
    subjectKey: nonEmptyString,
    usernames: z.array(nonEmptyString),
  })),
  expectedImplicitGrantManagerPositionCodes: z.array(nonEmptyString),
  separationOfDuties: z.array(z.object({
    key: nonEmptyString,
    resourceKey: nonEmptyString,
    leftActionKey: permissionActionKeySchema,
    rightActionKey: permissionActionKeySchema,
    description: nonEmptyString,
  }).refine((value) => value.leftActionKey !== value.rightActionKey, {
    path: ["rightActionKey"],
    message: "must differ from leftActionKey",
  })),
}).superRefine((value, context) => {
  const duplicate = <T>(items: T[], key: (item: T) => string, pathKey: string) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      const itemKey = key(item);
      if (seen.has(itemKey)) {
        context.addIssue({ code: "custom", path: [pathKey, index], message: `duplicate entry: ${itemKey}` });
      }
      seen.add(itemKey);
    });
  };
  duplicate(value.expectedResourceTopology, (item) => item.resourceKey, "expectedResourceTopology");
  duplicate(
    value.expectedGrants,
    (item) => JSON.stringify([item.subjectType, item.subjectKey, item.resourceKey, item.actionKey, item.scopeId]),
    "expectedGrants",
  );
  duplicate(value.expectedDirectGrantUserRoles, (item) => item.username, "expectedDirectGrantUserRoles");
  duplicate(
    value.expectedGrantSubjectAssignments,
    (item) => `${item.subjectType}:${item.subjectKey}`,
    "expectedGrantSubjectAssignments",
  );
  duplicate(value.separationOfDuties, (item) => item.key, "separationOfDuties");
});

let cached: { signature: string; value: TenantRuntimeConfig } | null = null;

function workspaceConfigDir() {
  const configured = process.env.WORKSPACE_CONFIG_DIR?.trim();
  if (!configured || !path.isAbsolute(configured)) {
    throw new Error("WORKSPACE_CONFIG_DIR must be an absolute path for tenant configuration");
  }
  return fs.realpathSync(configured);
}

function resolveWorkspaceFile(root: string, relativePath: string) {
  const resolved = path.resolve(root, relativePath);
  const prefix = `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(prefix)) {
    throw new Error(`Tenant config path escapes WORKSPACE_CONFIG_DIR: ${relativePath}`);
  }
  return resolved;
}

export function resolveTenantConfigPath(relativePath: string) {
  return resolveWorkspaceFile(workspaceConfigDir(), relativePath);
}

function readJson(filePath: string) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot read tenant config ${filePath}: ${message}`);
  }
}

function parseConfig<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Invalid ${label}: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  }
  return parsed.data;
}

function fileSignature(files: string[]) {
  return files.map((file) => `${file}:${fs.statSync(file).mtimeMs}:${fs.statSync(file).size}`).join("|");
}

function readTenantConfig(): { signature: string; value: TenantRuntimeConfig } {
  const root = workspaceConfigDir();
  const profilePath = resolveWorkspaceFile(root, "config/tenant/profile.json");
  const profile = parseConfig(profileSchema, readJson(profilePath), "tenant profile") as TenantProfile;
  const files = Object.fromEntries(
    Object.entries(profile.files).map(([key, value]) => [key, resolveWorkspaceFile(root, value)]),
  ) as Record<keyof TenantProfile["files"], string>;
  const signature = fileSignature([profilePath, ...Object.values(files)]);
  if (cached?.signature === signature) return cached;

  const ethnicities = parseConfig(z.object({ ethnicities: stringList, commonEthnicities: stringList }), readJson(files.hrEthnicities), "HR ethnicity config");
  const professionalTitles = parseConfig(z.object({
    groups: z.array(z.object({ series: nonEmptyString, levels: z.array(professionalTitleLevelSchema).min(1) })).min(1),
    aliases: z.record(z.string(), nonEmptyString.nullable()),
  }), readJson(files.hrProfessionalTitles), "HR professional-title config");
  const schools = parseConfig(z.object({
    specialSchools: z.array(z.object({ name: nonEmptyString, label: nonEmptyString.optional(), aliases: z.array(nonEmptyString).optional() })),
  }), readJson(files.hrSchoolWhitelist), "HR school-whitelist config");
  const hrCatalogs: TenantHrCatalogs = {
    ...ethnicities,
    professionalTitleGroups: professionalTitles.groups,
    professionalTitleAliases: professionalTitles.aliases,
    specialSchools: schools.specialSchools,
  };
  const value: TenantRuntimeConfig = {
    profile,
    companies: parseConfig(z.array(companySchema).min(1), readJson(files.companies), "tenant companies") as TenantCompanySeed[],
    hrCatalogs,
    agentWorkforce: parseConfig(agentWorkforceSchema, readJson(files.agentWorkforce), "tenant Agent workforce") as TenantAgentWorkforceConfig,
    permissionReview: parseConfig(permissionReviewSchema, readJson(files.permissionReview), "tenant permission review") as TenantPermissionReviewPolicy,
    financeImports: parseConfig(financeImportsSchema, readJson(files.financeImports), "tenant finance imports") as TenantFinanceImportConfig,
  };
  return { signature, value };
}

export function getTenantConfig(): TenantRuntimeConfig {
  const next = readTenantConfig();
  cached = next;
  return next.value;
}

export function getTenantProfile(): TenantProfile {
  return getTenantConfig().profile;
}

export function getTenantCompanies(): TenantCompanySeed[] {
  return getTenantConfig().companies;
}

export function getTenantAgentWorkforce(): TenantAgentWorkforceConfig {
  return getTenantConfig().agentWorkforce;
}

export function getTenantPermissionReview(): TenantPermissionReviewPolicy {
  const config = getTenantConfig();
  if (config.permissionReview.schedule.timeZone !== config.profile.localization.businessTimeZone) {
    throw new Error("Tenant permission review timeZone must match localization.businessTimeZone");
  }
  return config.permissionReview;
}

export function getTenantFinanceImports(): TenantFinanceImportConfig {
  return getTenantConfig().financeImports;
}

function tenantBrandLogoPath() {
  const root = workspaceConfigDir();
  for (const file of ["logo.png", "logo.svg"]) {
    const absolutePath = path.join(root, "assets/brand/company", file);
    if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile() && fs.statSync(absolutePath).size > 0) {
      return `/company/${file}`;
    }
  }
  return "/assets/brand/default-company-logo.svg";
}

export function getTenantPublicConfig(): TenantPublicConfig {
  const { profile, hrCatalogs } = getTenantConfig();
  const { companyDocuments: _companyDocuments, ...publicDocs } = profile.docs;
  return {
    key: profile.key,
    brand: { logoPath: tenantBrandLogoPath() },
    identity: profile.identity,
    localization: profile.localization,
    organization: profile.organization,
    finance: profile.finance,
    work: profile.work,
    hr: profile.hr,
    docs: publicDocs,
    hrCatalogs,
  };
}

export function invalidateTenantConfigCache() {
  cached = null;
}
