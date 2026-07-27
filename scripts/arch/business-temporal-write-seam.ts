#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export type BusinessTemporalWriteRule = {
  delegate: string;
  model: string;
  allowedFiles: readonly string[];
};

export type BusinessTemporalWriteViolation = {
  model: string;
  file: string;
  line: number;
  method: string;
};

const WRITE_METHODS = ["create", "createMany", "update", "updateMany", "delete", "deleteMany", "upsert"] as const;

export const BUSINESS_TEMPORAL_WRITE_RULES: readonly BusinessTemporalWriteRule[] = [{
  delegate: "employeeProject",
  model: "EmployeeProject",
  allowedFiles: [
    "packages/work/server/project-membership-lifecycle-service.ts",
    "packages/hr/server/employee-lifecycle.ts",
    "scripts/import/import-company-priority-projects.ts",
  ],
}, {
  delegate: "projectMembershipChange",
  model: "ProjectMembershipChange",
  allowedFiles: [
    "packages/work/server/project-membership-lifecycle-service.ts",
    "packages/hr/server/employee-lifecycle.ts",
    "scripts/import/import-company-priority-projects.ts",
  ],
}, {
  delegate: "departmentManagerEmployee",
  model: "DepartmentManagerEmployee",
  allowedFiles: [],
}, {
  delegate: "organizationStructureChange",
  model: "OrganizationStructureChange",
  allowedFiles: [
    "packages/hr/server/organization-structure-change-ledger.ts",
    "packages/hr/server/organization-structure-lifecycle-service.ts",
  ],
}, {
  delegate: "departmentEffectiveVersion",
  model: "DepartmentEffectiveVersion",
  allowedFiles: ["packages/hr/server/organization-structure-lifecycle-service.ts"],
}, {
  delegate: "positionEffectiveVersion",
  model: "PositionEffectiveVersion",
  allowedFiles: ["packages/hr/server/organization-structure-lifecycle-service.ts"],
}, {
  delegate: "positionReportOverride",
  model: "PositionReportOverride",
  allowedFiles: ["packages/hr/server/organization-structure-lifecycle-service.ts"],
}, {
  delegate: "positionReportOverrideEffectiveVersion",
  model: "PositionReportOverrideEffectiveVersion",
  allowedFiles: ["packages/hr/server/organization-structure-lifecycle-service.ts"],
}, {
  delegate: "positionDescription",
  model: "PositionDescription",
  allowedFiles: ["packages/hr/server/position-description-revision-service.ts"],
}, {
  delegate: "positionDescriptionRevision",
  model: "PositionDescriptionRevision",
  allowedFiles: ["packages/hr/server/position-description-revision-service.ts"],
}, {
  delegate: "ownershipInterest",
  model: "OwnershipInterest",
  allowedFiles: ["packages/capital-securities/server/ownership-projection.ts"],
}, {
  delegate: "ownershipProjectionRun",
  model: "OwnershipProjectionRun",
  allowedFiles: ["packages/capital-securities/server/ownership-projection.ts"],
}, {
  delegate: "shareCapitalEvent",
  model: "ShareCapitalEvent",
  allowedFiles: ["packages/capital-securities/server/consolidation-inclusion.ts"],
}, {
  delegate: "shareCapitalTransaction",
  model: "ShareCapitalTransaction",
  allowedFiles: [],
}, {
  delegate: "shareCapitalSnapshotPosition",
  model: "ShareCapitalSnapshotPosition",
  allowedFiles: [],
}, {
  delegate: "partyLegalFactRevision",
  model: "PartyLegalFactRevision",
  allowedFiles: ["packages/platform/server/party-legal-facts.ts"],
}, {
  delegate: "party",
  model: "Party",
  allowedFiles: [
    "packages/platform/server/party-directory.ts",
    "packages/platform/server/party-legal-facts.ts",
    "packages/external/server/external-party-service.ts",
    "packages/external/server/external-party-role-lifecycle-service.ts",
    "scripts/testing/seed-e2e.ts",
  ],
}, {
  delegate: "company",
  model: "Company",
  allowedFiles: [
    "packages/platform/server/party-legal-facts.ts",
    "packages/capital-securities/server/company-governance.ts",
    "scripts/testing/seed-e2e.ts",
  ],
}, {
  delegate: "externalPartyRole",
  model: "ExternalPartyRole",
  allowedFiles: ["packages/external/server/external-party-role-lifecycle-service.ts"],
}, {
  delegate: "externalPartyRolePeriod",
  model: "ExternalPartyRolePeriod",
  allowedFiles: ["packages/external/server/external-party-role-lifecycle-service.ts"],
}, {
  delegate: "employmentAgreementChange",
  model: "EmploymentAgreementChange",
  allowedFiles: ["packages/hr/server/employment-agreements.ts"],
}, {
  delegate: "contractRevision",
  model: "ContractRevision",
  allowedFiles: ["packages/administration/server/contract-revisions.ts"],
}, {
  delegate: "contractStateEvent",
  model: "ContractStateEvent",
  allowedFiles: ["packages/administration/server/contract-revisions.ts", "packages/administration/server/contract-state-events.ts"],
}];

export function findBusinessTemporalWriteViolations(
  files: ReadonlyMap<string, string>,
  rules: readonly BusinessTemporalWriteRule[] = BUSINESS_TEMPORAL_WRITE_RULES,
) {
  const violations: BusinessTemporalWriteViolation[] = [];
  for (const [file, source] of files) {
    for (const rule of rules) {
      if (rule.allowedFiles.includes(file)) continue;
      const pattern = new RegExp(`\\b${rule.delegate}\\s*\\.\\s*(${WRITE_METHODS.join("|")})\\s*\\(`, "g");
      for (const match of source.matchAll(pattern)) {
        violations.push({
          model: rule.model,
          file,
          line: source.slice(0, match.index).split("\n").length,
          method: match[1]!,
        });
      }
    }
  }
  return violations.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line);
}

function repositorySources(repositoryRoot: string) {
  const names = execFileSync("rg", ["--files", "packages", "app", "scripts", "-g", "*.ts", "-g", "*.tsx"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim().split("\n").filter(Boolean);
  const files = new Map<string, string>();
  for (const name of names) {
    if (name.endsWith(".test.ts") || name.endsWith(".test.tsx")) continue;
    files.set(name, fs.readFileSync(path.join(repositoryRoot, name), "utf8"));
  }
  return files;
}

function main() {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const violations = findBusinessTemporalWriteViolations(repositorySources(repositoryRoot));
  if (violations.length) {
    for (const violation of violations) {
      console.error(`${violation.file}:${violation.line}: ${violation.model}.${violation.method} 绕过 Business Temporal command seam`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`Business Temporal write seam passed (${BUSINESS_TEMPORAL_WRITE_RULES.length} protected models)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main();
