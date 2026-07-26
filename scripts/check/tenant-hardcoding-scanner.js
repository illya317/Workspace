const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const DEFAULT_EXCLUDED_SCOPES = [
  { prefix: "packages/hr/constants/data/china-institutions.json", reason: "reusable public reference catalog" },
  { prefix: "packages/hr/constants/data/qs-world-rankings.json", reason: "reusable public reference catalog" },
  { prefix: "packages/hr/constants/data/undergraduate-majors.json", reason: "reusable public reference catalog" },
  { prefix: "docs/product/reference/casc/", reason: "public accounting-standard reference documents" },
];

const FORBIDDEN_TRACKED_PREFIXES = [
  "generated/production/",
  "ops/data-releases/",
  "prisma/migrations-sqlite-legacy/",
  "prisma/seed-data/finance-cost/",
];
const FORBIDDEN_TRACKED_EXTENSIONS = /\.(?:csv|docx?|jpe?g|pdf|png|pptx?|xlsx?)$/i;

const STRUCTURAL_RULES = [
  {
    id: "tenant-array-declaration",
    pattern: /\b(?:ADMINISTRATIVE_DEPARTMENT_CODES|OPERATING_COMMITTEE_DEPARTMENT_CODE|EXECUTIVE_PRESIDENT_POSITION_NAMES|IMPLICIT_ALL_ADMIN_EMPLOYEE_IDS|IMPLICIT_GRANT_DEPARTMENT_KEYWORDS|DEFAULT_GROUP_CODES|COMPANY_PROJECT_CODE_PREFIX|HR_POSITION_DESCRIPTION_DEPARTMENT_CODE|HR_POSITION_DESCRIPTION_DEPARTMENT_NAME|QC_DEPARTMENT_CODE|QC_DEPARTMENT_NAME)\b\s*=/,
    message: "tenant policy declaration must come from the Platform tenant profile",
  },
  {
    id: "tenant-hr-option-declaration",
    pattern: /\b(?:HR_(?:EDUCATIONS|POLITICS|ATTENDANCE_TYPES|OFFICE_LOCATIONS|LEGAL_RELATIONS|CONTRACT_TYPES|EMPLOYMENT_FORMS|INSURANCE_STATUSES|PERSONNEL_TYPES|LEAVE_REASONS|RANKS|EMPLOYMENT_TITLES)|EDUCATION_REQUIREMENT_OPTIONS|SALARY_TYPE_OPTIONS|WORK_SCHEDULE_OPTIONS|WORK_AREA_OPTIONS|ENVIRONMENT_FACTOR_OPTIONS)\b\s*=/,
    message: "tenant HR option catalogs must come from tenant configuration",
  },
  {
    id: "tenant-business-time-zone",
    pattern: /\b(?:WORKSPACE_BUSINESS_TIME_ZONE|SHANGHAI_UTC_OFFSET_MILLISECONDS)\b\s*=/,
    message: "business time zone must come from tenant configuration",
  },
  {
    id: "personal-absolute-path",
    pattern: /(?:["'`]|^)(?:\/Users\/[^/\s"'`]+|\/home\/ubuntu)\//,
    message: "personal or server-specific absolute path must come from workspace manifest/configuration",
  },
  {
    id: "repository-default",
    pattern: /(?:DEFAULT_[A-Z_]*(?:_REPO|_REPOSITORY)\b|fallback[A-Za-z]*(?:Repo|Repository)\b|\?\?\s*["'`]https:\/\/cnb\.cool\/|\|\|\s*["'`]https:\/\/cnb\.cool\/)/,
    message: "repository fallback must come from workspace manifest/configuration",
  },
  {
    id: "qc-config-root-default",
    pattern: /\bDEFAULT_CONFIG_ROOT\b\s*=/,
    message: "QC config root must resolve from WORKSPACE_CONFIG_DIR",
  },
  {
    id: "legacy-public-tenant-identity",
    pattern: /NEXT_PUBLIC_(?:APP_NAME|COMPANY_NAME)/,
    message: "tenant identity must come from the root tenant configuration snapshot",
  },
];

function normalizeRelative(value) {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function parseKeyValueFile(filePath) {
  const values = new Map();
  if (!fs.existsSync(filePath)) return values;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values.set(match[1], value);
  }
  return values;
}

function resolveWorkspaceConfigDir(root, env = process.env) {
  const repoEnv = parseKeyValueFile(path.join(root, ".env"));
  const candidates = [
    env.LOCAL_WORKSPACE_CONFIG_DIR,
    env.WORKSPACE_CONFIG_DIR,
    repoEnv.get("WORKSPACE_CONFIG_DIR"),
  ].filter(Boolean);
  if (candidates.length === 0) throw new Error("WORKSPACE_CONFIG_DIR is required for tenant hardcoding checks");
  const expanded = String(candidates[0]).replace(/^~(?=\/|$)/, env.HOME || "");
  if (!path.isAbsolute(expanded)) throw new Error(`WORKSPACE_CONFIG_DIR must be absolute: ${expanded}`);
  if (!fs.existsSync(expanded)) throw new Error(`WORKSPACE_CONFIG_DIR does not exist: ${expanded}`);
  return fs.realpathSync(expanded);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function resolveWorkspaceFile(root, relativePath) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath)) {
    throw new Error(`Tenant file reference must be relative: ${String(relativePath)}`);
  }
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Tenant file reference escapes WORKSPACE_CONFIG_DIR: ${relativePath}`);
  }
  return resolved;
}

function loadTenantScanInput(workspaceConfigDir) {
  const profile = readJson(path.join(workspaceConfigDir, "config/tenant/profile.json"));
  const manifest = readJson(path.join(workspaceConfigDir, "manifest.json"));
  const companies = readJson(resolveWorkspaceFile(workspaceConfigDir, profile.files?.companies));
  const agentWorkforce = readJson(resolveWorkspaceFile(workspaceConfigDir, profile.files?.agentWorkforce));
  const privateSignalsFile = path.join(workspaceConfigDir, "config/tenant/source-code-forbidden-signals.json");
  const sourceCodeForbiddenSignals = fs.existsSync(privateSignalsFile)
    ? readJson(privateSignalsFile)
    : { schemaVersion: 1, signals: [] };
  return { profile, manifest, companies, agentWorkforce, sourceCodeForbiddenSignals };
}

function signal(id, value, mode = "literal", contextPattern) {
  if (typeof value !== "string" || value.trim() === "") return null;
  return { id, value, mode, contextPattern };
}

function collectTenantSignals({ profile, manifest, companies, agentWorkforce, sourceCodeForbiddenSignals }) {
  const signals = [];
  const add = (next) => { if (next) signals.push(next); };

  if (sourceCodeForbiddenSignals?.schemaVersion !== 1 || !Array.isArray(sourceCodeForbiddenSignals.signals)) {
    throw new Error("source-code-forbidden-signals.json must use schemaVersion 1 and declare signals[]");
  }
  for (const [index, item] of sourceCodeForbiddenSignals.signals.entries()) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id
      || typeof item.value !== "string" || !item.value.trim()
      || !["literal", "substring"].includes(item.mode)) {
      throw new Error(`source-code-forbidden-signals.json has an invalid signal at index ${index}`);
    }
    add(signal(`private:${item.id}`, item.value, item.mode));
  }

  for (const company of companies || []) {
    add(signal(`company-name:${company.code}`, company.name, [...String(company.name)].length <= 3 ? "literal" : "substring"));
    add(signal(`company-code:${company.code}`, company.code, "semantic", /company|companies|codePool|group|scope|ledger|report|reference|country|import/i));
  }
  add(signal("localization:business-time-zone", profile.localization?.businessTimeZone, "literal"));
  const groups = profile.organization?.managementGroups || {};
  add(signal("management-group:default", groups.default, "literal"));
  add(signal("management-group:regulated", groups.regulated, "literal"));
  const committee = profile.organization?.operatingCommittee || {};
  add(signal("operating-committee-code", committee.departmentCode, "literal"));
  add(signal("operating-committee-name", committee.departmentName, "substring"));
  for (const name of committee.executivePositionNames || []) add(signal(`executive-position:${name}`, name, "substring"));
  for (const code of profile.organization?.administrativeDepartmentCodes || []) add(signal(`administrative-department:${code}`, code, "literal"));
  for (const employeeId of profile.organization?.implicitAllAdminEmployeeIds || []) add(signal(`implicit-admin:${employeeId}`, employeeId, "literal"));

  add(signal("work:company-project-prefix", profile.work?.companyProjectCodePrefix, "semantic", /project|company|prefix|code/i));
  for (const [key, department] of Object.entries({
    hrPositionDescription: profile.docs?.hrPositionDescriptionDepartment,
    qc: profile.docs?.qcDepartment,
  })) {
    add(signal(`docs:${key}:code`, department?.code, "literal"));
    add(signal(`docs:${key}:name`, department?.name, "substring"));
  }
  for (const productKey of profile.docs?.officialQcProductKeys || []) add(signal(`qc-product:${productKey}`, productKey, "substring"));

  add(signal("agent:department-code", profile.agent?.department?.code, "literal"));
  add(signal("agent:department-name", profile.agent?.department?.name, "literal"));
  add(signal("agent:parent-position-code", profile.agent?.parentPosition?.code, "literal"));
  add(signal("agent:parent-position-name", profile.agent?.parentPosition?.name, "literal"));
  add(signal("hr:virtual-employee-personnel-type", profile.hr?.options?.virtualEmployeePersonnelType, "literal"));
  add(signal("hr:insured-status", profile.hr?.options?.insuranceStatusMapping?.insured, "literal"));
  add(signal("hr:uninsured-status", profile.hr?.options?.insuranceStatusMapping?.uninsured, "literal"));
  add(signal("hr:secondary-department-label", profile.hr?.roster?.secondaryDepartmentLabel, "substring"));
  add(signal("hr:secondary-position-label", profile.hr?.roster?.secondaryPositionLabel, "substring"));
  for (const title of profile.hr?.roster?.excludedEmploymentTitles || []) add(signal(`hr:excluded-employment-title:${title}`, title, "literal"));
  for (const [catalog, aliases] of Object.entries(profile.hr?.optionAliases || {})) {
    for (const alias of Object.keys(aliases || {})) add(signal(`hr:option-alias:${catalog}:${alias}`, alias, "literal"));
  }
  for (const [key, configured] of Object.entries(profile.hr?.positionDescriptionOptions || {})) {
    const values = Array.isArray(configured) ? configured : [configured];
    for (const value of values) add(signal(`hr:position-description:${key}:${value}`, value, "literal"));
  }
  for (const member of agentWorkforce?.workforce || []) {
    add(signal(`agent:employee:${member.employeeId}`, member.employeeId, "literal"));
    add(signal(`agent:position:${member.positionCode}`, member.positionCode, "literal"));
    add(signal(`agent:display:${member.employeeId}`, member.displayName, "literal"));
    add(signal(`agent:role:${member.employeeId}`, member.roleName, "literal"));
    add(signal(`agent:username:${member.employeeId}`, member.username, "literal"));
    add(signal(`agent:profile:${member.employeeId}`, member.profileKey, "literal"));
    add(signal(`agent:responsibilities:${member.employeeId}`, member.responsibilities, "substring"));
    for (const [index, binding] of (member.runtimeBindings || []).entries()) {
      add(signal(`agent:runtime-instructions:${member.employeeId}:${index}`, binding.instructions, "substring"));
    }
  }

  add(signal("workspace:source-repository", manifest.sourceRepository, "substring"));
  const repositoryMatch = String(manifest.sourceRepository || "").match(/cnb\.cool\/([^/]+\/[^/.]+)(?:\.git)?$/i);
  if (repositoryMatch) add(signal("workspace:repository-slug", repositoryMatch[1], "substring"));
  add(signal("workspace:stable-local-path", manifest.stableLocalPath, "substring"));
  add(signal("workspace:remote-dir", manifest.productionTarget?.remoteDir, "substring"));
  add(signal("workspace:remote-config-dir", manifest.productionTarget?.workspaceConfigDir, "substring"));

  const unique = new Map();
  for (const item of signals) unique.set(`${item.id}:${item.value}:${item.mode}`, item);
  return [...unique.values()];
}

function isExcluded(relativePath, excludedScopes = DEFAULT_EXCLUDED_SCOPES) {
  const normalized = normalizeRelative(relativePath);
  return excludedScopes.some(({ prefix }) => normalized === prefix.replace(/\/$/, "") || normalized.startsWith(prefix));
}

function walkUntrackedFixture(root, excludedScopes) {
  const relativeFiles = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      const relative = normalizeRelative(path.relative(root, full));
      if ([".git", ".next", "node_modules"].includes(entry.name)) continue;
      if (isExcluded(relative, excludedScopes)) continue;
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() || entry.isSymbolicLink()) relativeFiles.push(relative);
    }
  }
  visit(root);
  return relativeFiles;
}

function repositoryFiles(root, excludedScopes) {
  let relativeFiles;
  try {
    relativeFiles = execFileSync(
      "git",
      ["-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      { encoding: "utf8" },
    ).split("\0").filter(Boolean).map(normalizeRelative);
  } catch {
    relativeFiles = walkUntrackedFixture(root, excludedScopes);
  }
  return [...new Set(relativeFiles)]
    .filter((relative) => !isExcluded(relative, excludedScopes))
    .filter((relative) => fs.existsSync(path.join(root, relative)))
    .sort();
}

function containsQuotedLiteral(line, value) {
  return line.includes(`"${value}"`) || line.includes(`'${value}'`) || line.includes(`\`${value}\``);
}

function matchSignal(line, relativePath, item) {
  if (item.mode === "substring") return line.includes(item.value);
  if (!containsQuotedLiteral(line, item.value)) return false;
  if (item.mode !== "semantic") return true;
  return item.contextPattern.test(line);
}

function scanContent({ content, relativePath, signals, structuralRules = STRUCTURAL_RULES }) {
  const violations = [];
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const item of signals) {
      if (!matchSignal(line, relativePath, item)) continue;
      violations.push({
        key: `${relativePath}:${index + 1}:${item.id}`,
        file: relativePath,
        line: index + 1,
        signalId: item.id,
        message: `tenant value ${JSON.stringify(item.value)} is hardcoded outside WORKSPACE_CONFIG_DIR`,
      });
    }
    for (const rule of structuralRules) {
      if (!rule.pattern.test(line)) continue;
      violations.push({
        key: `${relativePath}:${index + 1}:${rule.id}`,
        file: relativePath,
        line: index + 1,
        signalId: rule.id,
        message: rule.message,
      });
    }
  }
  return violations;
}

function scanRepository({ root, signals, excludedScopes = DEFAULT_EXCLUDED_SCOPES }) {
  const files = repositoryFiles(root, excludedScopes);
  const violations = [];
  for (const relativePath of files) {
    const file = path.join(root, relativePath);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) {
      violations.push({ key: `${relativePath}:1:tracked-symlink`, file: relativePath, line: 1, signalId: "tracked-symlink", message: "tracked symlinks are not accepted by the tenant-data boundary" });
      continue;
    }
    const forbiddenPrefix = FORBIDDEN_TRACKED_PREFIXES.find((prefix) => relativePath.startsWith(prefix));
    if (forbiddenPrefix) {
      violations.push({ key: `${relativePath}:1:forbidden-data-location`, file: relativePath, line: 1, signalId: "forbidden-data-location", message: `tracked files are forbidden under ${forbiddenPrefix}` });
    }
    if (FORBIDDEN_TRACKED_EXTENSIONS.test(relativePath)) {
      violations.push({ key: `${relativePath}:1:forbidden-data-file`, file: relativePath, line: 1, signalId: "forbidden-data-file", message: "binary or tabular source data must live outside Git" });
    }
    if ((relativePath.startsWith("docs/planning/") && path.basename(relativePath) !== "README.md")
      || relativePath === "planning.md"
      || relativePath.endsWith("/PLAN.md")) {
      violations.push({
        key: `${relativePath}:1:source-planning-ledger`,
        file: relativePath,
        line: 1,
        signalId: "source-planning-ledger",
        message: "operational plans and business ledgers must live in the ignored private .planning directory",
      });
    }
    const body = fs.readFileSync(file);
    if (body.includes(0)) continue;
    const content = body.toString("utf8");
    violations.push(...scanContent({ content, relativePath, signals }));
    if (relativePath.startsWith("prisma/migrations/")
      && /^(?:\s*)(?:INSERT|UPDATE|DELETE|MERGE|COPY)\b/im.test(content)) {
      violations.push({ key: `${relativePath}:1:migration-business-dml`, file: relativePath, line: 1, signalId: "migration-business-dml", message: "Prisma migrations must be schema-only and cannot contain business DML" });
    }
  }
  violations.sort((left, right) => left.key.localeCompare(right.key));
  return { scannedFiles: files.length, violations };
}

function evaluateBaseline(violations, activeBaseline = []) {
  const current = [...new Set(violations.map((item) => item.key))].sort();
  const baseline = [...new Set(activeBaseline)].sort();
  const currentSet = new Set(current);
  const baselineSet = new Set(baseline);
  return {
    additions: current.filter((item) => !baselineSet.has(item)),
    stale: baseline.filter((item) => !currentSet.has(item)),
  };
}

module.exports = {
  DEFAULT_EXCLUDED_SCOPES,
  STRUCTURAL_RULES,
  collectTenantSignals,
  evaluateBaseline,
  loadTenantScanInput,
  resolveWorkspaceConfigDir,
  scanContent,
  scanRepository,
};
