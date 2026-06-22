import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

const HR_SERVICE_RULES = [
  {
    file: "packages/hr/server/edps.ts",
    requiredImport: "./domain/edp-validation",
  },
  {
    file: "packages/hr/server/employee-edps.ts",
    requiredImport: "./domain/edp-validation",
  },
  {
    file: "packages/hr/server/positions.ts",
    requiredImport: "./domain/position-validation",
  },
  {
    file: "packages/hr/server/employees.ts",
    requiredImport: "./domain/employee-validation",
  },
  {
    file: "packages/hr/server/employments.ts",
    requiredImport: "./domain/employment-validation",
  },
  {
    file: "packages/hr/server/contracts.ts",
    requiredImport: "./domain/contract-validation",
  },
  {
    file: "packages/hr/server/employee-contracts.ts",
    requiredImport: "./domain/contract-validation",
  },
  {
    file: "packages/hr/server/departments.ts",
    requiredImport: "./domain/department-validation",
  },
  {
    file: "packages/hr/server/companies.ts",
    requiredImport: "./domain/company-validation",
  },
  {
    file: "packages/hr/server/company-relations.ts",
    requiredImport: "./domain/company-relation-validation",
  },
  {
    file: "packages/hr/server/position-descriptions.ts",
    requiredImport: "./domain/position-description-validation",
  },
] as const;

const HR_ROUTE_ROOT = "app/api/modules/hr/roster";

const HR_SERVER_INDEX = "packages/hr/server/index.ts";

const FORBIDDEN_SERVICE_RULE_TOKENS = [
  "validateFkValue",
  "parseWorkPercent",
  "isValidDateValue",
  "rejectInvalidDateField",
  "validateEdpReportTo",
  "validateEmploymentOption",
  "validateContractOption",
  "isValidCompanyName",
  "normalizeEmployeeOption",
  "guardPositionArchive",
  "guardDepartmentArchive",
  "guardEmployeeInactive",
];

const FORBIDDEN_ROUTE_DOMAIN_EXPORTS = [
  "buildEdpCreateCommand",
  "buildEdpFieldUpdateCommand",
  "buildSaveEmployeeEdpsCommand",
  "edpUpdateAffectsCurrentTotal",
  "validateCurrentTotal",
  "validateEdpCreateCurrentTotal",
  "validateEdpFieldUpdateCurrentTotal",
  "buildPositionCreateCommand",
  "buildPositionUpdateCommand",
  "validatePositionDelete",
  "validatePositionFieldUpdate",
  "buildEmployeeCreateCommand",
  "buildEmployeeFieldUpdateCommand",
  "buildEmploymentCreateCommand",
  "buildEmploymentFieldUpdateCommand",
  "buildContractCreateCommand",
  "buildContractFieldUpdateCommand",
  "buildEmployeeProfileContractsCommand",
  "buildDepartmentCreateCommand",
  "buildDepartmentFieldUpdateCommand",
  "buildDepartmentUpdateCommand",
  "validateDepartmentDelete",
  "buildCompanyCreateCommand",
  "buildCompanyFieldUpdateCommand",
  "buildCompanyUpsertCommand",
  "buildCompanyRelationCreateCommand",
  "buildCompanyRelationFieldUpdateCommand",
  "buildPositionDescriptionUpdateCommand",
  "validateFkValue",
  "parseWorkPercent",
  "isValidDateValue",
  "rejectInvalidDateField",
  "validateEdpReportTo",
  "validateEmploymentOption",
  "validateContractOption",
  "isValidCompanyName",
  "normalizeEmployeeOption",
  "EDP_ALLOWED_FIELDS",
  "POSITION_ALLOWED_FIELDS",
  "EMPLOYEE_ALLOWED_FIELDS",
  "EMPLOYMENT_ALLOWED_FIELDS",
  "DEPARTMENT_ALLOWED_FIELDS",
  "COMPANY_ALLOWED_FIELDS",
  "COMPANY_RELATION_ALLOWED_FIELDS",
];

function readRequired(relPath: string) {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) throw new Error(`Missing expected file: ${relPath}`);
  return fs.readFileSync(fullPath, "utf8");
}

function hasImport(source: string, specifier: string) {
  return new RegExp(`from\\s+["']${specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`).test(source);
}

function hasToken(source: string, token: string) {
  return new RegExp(`\\b${token}\\b`).test(source);
}

function collectApiTreeTsFiles(dir: string): string[] {
  const fullDir = path.join(ROOT, dir);
  if (!fs.existsSync(fullDir)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(fullDir, { withFileTypes: true })) {
    const relPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectApiTreeTsFiles(relPath));
    if (entry.isFile() && entry.name.endsWith(".ts")) files.push(relPath);
  }
  return files.sort();
}

function forbiddenHrServerRouteImport(source: string) {
  const matches = source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']@workspace\/hr\/server["']/g);
  for (const match of matches) {
    const importedNames = match[1]
      .split(",")
      .map((name) => name.trim().split(/\s+as\s+/)[0]?.trim())
      .filter(Boolean);
    const forbidden = importedNames.find((name) => FORBIDDEN_ROUTE_DOMAIN_EXPORTS.includes(name));
    if (forbidden) return forbidden;
  }
  return null;
}

export function checkDomainValidation() {
  try {
    const hrServerIndex = readRequired(HR_SERVER_INDEX);
    if (/export\s+\*\s+from\s+["']\.\/domain\//.test(hrServerIndex)) {
      console.error(`✗ ${HR_SERVER_INDEX} must not re-export HR domain validators; routes should only see schemas/services.`);
      return false;
    }

    for (const rule of HR_SERVICE_RULES) {
      const source = readRequired(rule.file);
      if (!hasImport(source, rule.requiredImport)) {
        console.error(`✗ ${rule.file} must import ${rule.requiredImport}`);
        return false;
      }
      for (const token of FORBIDDEN_SERVICE_RULE_TOKENS) {
        if (hasToken(source, token)) {
          console.error(`✗ ${rule.file} must not use ${token}; move HR EDP/Position business validation into domain validators.`);
          return false;
        }
      }
    }

    for (const file of collectApiTreeTsFiles(HR_ROUTE_ROOT)) {
      const source = readRequired(file);
      if (/from\s+["'][^"']*\/domain\/[^"']*["']/.test(source)) {
        console.error(`✗ ${file} must call HR services, not domain validators directly or through route-local helpers.`);
        return false;
      }
      const forbidden = forbiddenHrServerRouteImport(source);
      if (forbidden) {
        console.error(`✗ ${file} must not import ${forbidden} from @workspace/hr/server; call HR services instead.`);
        return false;
      }
    }

    console.log("✓ domain validation boundaries passed.");
    return true;
  } catch (error) {
    console.error("✗ domain validation boundary check failed.");
    console.error(error instanceof Error ? `  ${error.message}` : error);
    return false;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(checkDomainValidation() ? 0 : 1);
}
