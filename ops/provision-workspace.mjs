#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { initializeWorkspaceConfig } from "./init-workspace-config.mjs";
import { createTenantConfigManifest } from "./tenant-config-manifest.mjs";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE_PATH = "config/tenant/profile.json";

const OUTPUT_PATHS = Object.freeze([
  PROFILE_PATH,
  "config/tenant/companies.json",
  "config/tenant/agent-workforce.json",
  "config/tenant/permission-review.json",
  "config/tenant/finance-imports.json",
  "config/tenant/product-name-aliases.json",
  "config/tenant/cnb-release.yml",
  "config/hr/ethnicities.json",
  "config/hr/professional-titles.json",
  "config/hr/school-whitelist.json",
  "config/pharma-qc/product_stage_tests.json",
  "data/docs-editor/templates/production-qc-snapshots/audit.json",
  "assets/brand/company/logo.svg",
]);

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[++index];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error(`invalid argument: ${key ?? "<missing>"}`);
    }
    options[key.slice(2).replaceAll("-", "_")] = value;
  }
  return options;
}

function requireText(options, key) {
  const value = options[key]?.trim();
  if (!value) throw new Error(`--${key.replaceAll("_", "-")} is required`);
  return value;
}

function validateTenantKey(value) {
  if (!/^[a-z][a-z0-9-]{1,62}$/.test(value)) {
    throw new Error("--tenant-key must use 2-63 lowercase letters, digits, or hyphens and start with a letter");
  }
  return value;
}

function validateCompanyCode(value) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(value)) {
    throw new Error("--company-code must use 1-32 letters, digits, underscores, or hyphens");
  }
  return value;
}

function validateTimeZone(value) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
  } catch {
    throw new Error("--time-zone must be a valid IANA time zone");
  }
  return value;
}

function safeCode(value) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function companyLogoSvg(companyName) {
  const normalizedName = companyName.replace(/\s+/g, " ").trim();
  const mark = [...normalizedName.replace(/\s+/g, "")].slice(0, 2).join("").toUpperCase() || "W";
  const label = [...normalizedName].slice(0, 28).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="200" viewBox="0 0 640 200" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(normalizedName)}</title>
  <desc id="desc">Generated tenant company logo</desc>
  <defs>
    <linearGradient id="mark" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#065f46"/>
      <stop offset="1" stop-color="#0891b2"/>
    </linearGradient>
  </defs>
  <rect x="12" y="12" width="176" height="176" rx="48" fill="url(#mark)"/>
  <path d="M44 64h112v12H44zm0 30h112v12H44zm0 30h112v12H44z" fill="#fff" opacity=".18"/>
  <text x="100" y="121" fill="#fff" font-family="system-ui, sans-serif" font-size="54" font-weight="700" text-anchor="middle">${escapeXml(mark)}</text>
  <text x="220" y="104" fill="#0f172a" font-family="system-ui, sans-serif" font-size="42" font-weight="700">${escapeXml(label)}</text>
  <text x="222" y="140" fill="#64748b" font-family="system-ui, sans-serif" font-size="18" letter-spacing="4">WORKSPACE</text>
</svg>
`;
}

function buildTenantFiles(options) {
  const tenantKey = validateTenantKey(requireText(options, "tenant_key"));
  const companyCode = validateCompanyCode(requireText(options, "company_code"));
  const companyName = requireText(options, "company_name");
  const appName = options.app_name?.trim() || "Workspace";
  const appDescription = options.app_description?.trim() || `${companyName} workspace`;
  const timeZone = validateTimeZone(requireText(options, "time_zone"));
  const adminUsername = options.admin_username?.trim() || "admin";
  const codePrefix = safeCode(companyCode);
  const adminEmployeeId = options.admin_employee_id?.trim() || `${codePrefix}-ADMIN-001`;
  const primaryGroup = `${tenantKey}:primary`;
  const regulatedGroup = `${tenantKey}:regulated`;
  const currentYear = new Date().getUTCFullYear();

  const profile = {
    version: 1,
    key: tenantKey,
    files: {
      companies: "config/tenant/companies.json",
      agentWorkforce: "config/tenant/agent-workforce.json",
      permissionReview: "config/tenant/permission-review.json",
      financeImports: "config/tenant/finance-imports.json",
      productNameAliases: "config/tenant/product-name-aliases.json",
      cnbRelease: "config/tenant/cnb-release.yml",
      hrEthnicities: "config/hr/ethnicities.json",
      hrProfessionalTitles: "config/hr/professional-titles.json",
      hrSchoolWhitelist: "config/hr/school-whitelist.json",
    },
    directories: {
      qcTemplateSnapshots: "data/docs-editor/templates/production-qc-snapshots",
    },
    identity: { appName, companyName, appDescription },
    localization: { businessTimeZone: timeZone },
    library: {
      generatorCategories: {
        "finance-report": { code: "L-FIN", name: "Finance" },
        "ownership-structure": { code: "L-CORP", name: "Corporate" },
        "organization-chart": { code: "L-CORP", name: "Corporate" },
        "roster-due-diligence": { code: "L-PEOPLE", name: "People" },
        "contract-ledger": { code: "L-LEGAL", name: "Legal" },
      },
    },
    organization: {
      managementGroups: { default: primaryGroup, regulated: regulatedGroup },
      operatingCommittee: {
        departmentCode: `${codePrefix}-GOV`,
        departmentName: "Governing body",
        executivePositionNames: ["Executive"],
      },
      administrativeDepartmentCodes: [`${codePrefix}-ADMIN`],
      implicitAllAdminEmployeeIds: [adminEmployeeId],
      implicitGrantDepartmentKeywords: ["administration"],
    },
    finance: {
      referenceCompanyCode: companyCode,
      defaultLedgerCompanyCode: companyCode,
      consolidationCompanyCodes: [companyCode],
      countryReportProfiles: [],
      defaultAnalysisYear: currentYear,
      openingBalanceBaselineYear: currentYear - 1,
    },
    work: {
      companyProjectCodePrefix: codePrefix.slice(0, 8),
      companyProjectSequenceStart: 1,
      companyProjectSequenceEnd: 9999,
      otherProjectSequenceStart: 10001,
      companyProjectSequenceWidth: 4,
      departmentProjectSequenceWidth: 3,
    },
    hr: {
      options: {
        educations: ["Not specified"],
        politics: ["Not specified"],
        attendanceTypes: ["Full time"],
        officeLocations: ["Headquarters"],
        legalRelations: ["Employment"],
        contractTypes: ["Employment contract"],
        employmentForms: ["Full time"],
        insuranceStatuses: ["Active", "Inactive"],
        insuranceStatusMapping: { insured: "Active", uninsured: "Inactive" },
        personnelTypes: ["Employee", "Virtual employee"],
        virtualEmployeePersonnelType: "Virtual employee",
        leaveReasons: ["Other"],
        ranks: ["P1"],
        employmentTitles: ["Employee"],
      },
      optionAliases: { ethnicities: {}, politics: {}, educations: {} },
      positionDescriptionOptions: {
        educationRequirements: ["Not specified"],
        defaultEducationRequirement: "Not specified",
        salaryTypes: ["Not specified"],
        workSchedules: ["Standard"],
        workAreas: ["Office"],
        environmentFactors: ["Standard"],
      },
      roster: {
        primaryManagementGroup: primaryGroup,
        secondaryManagementGroup: regulatedGroup,
        secondaryDepartmentFieldKey: "regulatedDepartment",
        secondaryDepartmentLabel: "Regulated department",
        secondaryPositionFieldKey: "regulatedPosition",
        secondaryPositionLabel: "Regulated position",
        excludedEmploymentTitles: [],
      },
    },
    docs: {
      companyDocuments: [],
      hrPositionDescriptionDepartment: { code: `${codePrefix}-HR`, name: "Human Resources" },
      qcDepartment: { code: `${codePrefix}-QC`, name: "Quality Control" },
      officialQcProductKeys: [],
      standardTemplateAliases: {},
      resultSuffixUpgradeRules: [],
      formulaRules: { dryingWeightMultipliers: {} },
    },
    agent: {
      department: { code: `${codePrefix}-TECH`, name: "Technology" },
      parentPosition: { code: `${codePrefix}-TECH-LEAD`, name: "Technology Lead" },
    },
  };

  const agentUsername = `${tenantKey}-release-ops`;
  const files = new Map([
    [PROFILE_PATH, json(profile)],
    ["config/tenant/companies.json", json([
      {
        code: companyCode,
        name: companyName,
        managementGroup: primaryGroup,
        codePoolCode: companyCode,
        isActive: true,
        sortOrder: 1,
      },
    ])],
    ["config/tenant/agent-workforce.json", json({
      lockName: `workspace:agent-workforce:${tenantKey}`,
      provisionerLedgerSource: "agent_workforce_provisioner",
      managedWorkspaceResourceGrants: [],
      workforce: [
        {
          employeeId: `${codePrefix}-AI-OPS`,
          displayName: "Release Operations Agent",
          username: agentUsername,
          profileKey: `${tenantKey}.operations`,
          roleName: "Release Operations Agent",
          positionCode: `${codePrefix}-TECH-OPS`,
          responsibilities: "Prepare releases, validate runtime configuration, deploy approved builds, and report failures.",
          workspaceResourceGrants: [],
          legacyAllowedToolKeys: [],
          runtimeBindings: [
            {
              runtimeKind: "server_ops",
              interactive: false,
              capabilityKeys: ["release.prepare", "deploy.execute", "runtime.verify", "security.alert"],
              instructions: "Operate only through approved release and deployment workflows.",
            },
          ],
        },
      ],
    })],
    ["config/tenant/permission-review.json", json({
      version: 1,
      schedule: { dailyAt: "08:00", timeZone },
      actorUsername: agentUsername,
      notificationRecipientUsernames: [adminUsername],
      remindOpenAfterHours: 24,
      expectedResourceTopology: [],
      expectedGrants: [],
      expectedDirectGrantUserRoles: [],
      expectedGrantSubjectAssignments: [],
      expectedImplicitGrantManagerPositionCodes: [],
      separationOfDuties: [],
    })],
    ["config/tenant/finance-imports.json", json({ cashFlowCompanyAliases: {}, readableSourceSeries: [] })],
    ["config/tenant/product-name-aliases.json", json({ schemaVersion: 1, aliases: {} })],
    ["config/hr/ethnicities.json", json({ ethnicities: ["Not specified"], commonEthnicities: ["Not specified"] })],
    ["config/hr/professional-titles.json", json({
      groups: [{ series: "General", levels: [{ level: "L1", title: "Professional" }] }],
      aliases: {},
    })],
    ["config/hr/school-whitelist.json", json({ specialSchools: [] })],
    ["config/pharma-qc/product_stage_tests.json", json({ schema_version: 1, products: [] })],
    ["data/docs-editor/templates/production-qc-snapshots/audit.json", json({
      schemaVersion: 1,
      kind: "qc-template-generation-audit",
      outputRoot: "data/docs-editor/templates/production-qc-snapshots",
      products: [],
    })],
    ["assets/brand/company/logo.svg", companyLogoSvg(companyName)],
  ]);
  files.set("config/tenant/cnb-release.yml", readFileSync(path.join(REPOSITORY_ROOT, "ops/cnb-release.yml"), "utf8"));
  return { tenantKey, companyCode, companyName, files };
}

function writeProvisionedFiles(root, files) {
  const conflicts = OUTPUT_PATHS.filter((relativePath) => existsSync(path.join(root, relativePath)));
  if (conflicts.length > 0) {
    throw new Error(`workspace is already provisioned or contains managed files: ${conflicts.join(", ")}`);
  }

  const written = [];
  try {
    for (const relativePath of OUTPUT_PATHS) {
      const target = path.join(root, relativePath);
      mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      writeFileSync(target, files.get(relativePath), { mode: 0o600 });
      written.push(target);
    }
  } catch (error) {
    for (const target of written.reverse()) rmSync(target, { force: true });
    throw error;
  }
  return written;
}

function validateProvisionedWorkspace(root) {
  const manifest = createTenantConfigManifest(root);
  const result = spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      path.join(REPOSITORY_ROOT, "scripts/check/check-tenant-runtime-config.ts"),
      "--workspace",
      root,
    ],
    { cwd: REPOSITORY_ROOT, encoding: "utf8" },
  );
  if (result.error || result.status !== 0) {
    const detail = (result.stderr || result.stdout || result.error?.message || "unknown validation error").trim();
    throw new Error(`generated tenant configuration is invalid: ${detail}`);
  }
  return manifest;
}

export function provisionWorkspace(rootValue, options) {
  const initialized = initializeWorkspaceConfig(rootValue);
  const tenant = buildTenantFiles(options);
  const written = writeProvisionedFiles(initialized.root, tenant.files);
  try {
    const manifest = validateProvisionedWorkspace(initialized.root);
    return { ...tenant, root: initialized.root, written, manifest };
  } catch (error) {
    for (const target of written.reverse()) rmSync(target, { force: true });
    throw error;
  }
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const root = requireText(options, "root");
  const result = provisionWorkspace(root, options);
  process.stdout.write(`Workspace tenant provisioned: ${result.root}\n`);
  process.stdout.write(`Tenant: ${result.tenantKey}; primary company: ${result.companyCode} ${result.companyName}\n`);
  process.stdout.write(`Created ${result.written.length} private tenant files without database credentials, secrets, uploaded media, or business imports.\n`);
  process.stdout.write("Next: add .env, favicon and Agent avatar, review the generated SVG and neutral catalogs, then run npm run workspace:check.\n");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
