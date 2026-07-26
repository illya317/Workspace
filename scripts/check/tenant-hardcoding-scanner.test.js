const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  collectTenantSignals,
  evaluateBaseline,
  scanContent,
  scanRepository,
} = require("./tenant-hardcoding-scanner");

function syntheticInput() {
  return {
    profile: {
      organization: {
        managementGroups: { default: "GENERAL-X", regulated: "REGULATED-X" },
        operatingCommittee: { departmentCode: "COM-X", departmentName: "Steering X", executivePositionNames: ["Chief X"] },
        administrativeDepartmentCodes: ["ADM-X"],
        implicitAllAdminEmployeeIds: ["EMP-X"],
      },
      finance: {
        referenceCompanyCode: "C-X",
        defaultLedgerCompanyCode: "C-Y",
        consolidationCompanyCodes: ["C-X", "C-Y"],
      },
      work: { companyProjectCodePrefix: "PX" },
      docs: {
        hrPositionDescriptionDepartment: { code: "HR-X", name: "People X" },
        qcDepartment: { code: "QC-X", name: "Quality X" },
        officialQcProductKeys: ["product_x"],
      },
      agent: {
        department: { code: "AG-X", name: "Automation X" },
        parentPosition: { code: "POS-X", name: "Automation Lead X" },
      },
    },
    companies: [{ code: "C-X", name: "Acme X" }, { code: "C-Y", name: "Acme Y" }],
    manifest: {
      sourceRepository: "https://cnb.cool/example/acme-x.git",
      stableLocalPath: "/opt/acme-x",
      productionTarget: { remoteDir: "/srv/acme-x", workspaceConfigDir: "/srv/acme-x/.workspace" },
    },
    agentWorkforce: {
      workforce: [{
        employeeId: "BOT-X",
        positionCode: "BOT-POS-X",
        displayName: "Bot X",
        roleName: "Bot Role X",
        username: "bot-user-x",
        profileKey: "bot.profile.x",
        responsibilities: "Synthetic tenant responsibility X",
        runtimeBindings: [{ instructions: "Synthetic tenant runtime instruction X" }],
      }],
    },
    sourceCodeForbiddenSignals: {
      schemaVersion: 1,
      signals: [{ id: "legacy-brand-fragment", value: "PrivateBrandX", mode: "substring" }],
    },
  };
}

test("derives rules from a synthetic tenant instead of current-company constants", () => {
  const signals = collectTenantSignals(syntheticInput());
  const violations = scanContent({
    relativePath: "packages/example/server.ts",
    content: 'const companyCode = "C-X";\nconst department = "HR-X";\n',
    signals,
  });
  assert.deepEqual(violations.map((item) => item.signalId), ["company-code:C-X", "docs:hrPositionDescription:code"]);
});

test("private source-code signals catch tenant fragments that structured profile values cannot derive", () => {
  const signals = collectTenantSignals(syntheticInput());
  const violations = scanContent({
    relativePath: "packages/example/fixture.ts",
    content: 'const label = "PrivateBrandX / subdivision";\n',
    signals,
  });
  assert.deepEqual(violations.map((item) => item.signalId), ["private:legacy-brand-fragment"]);
});

test("scans fixtures and migrations instead of treating them as tenant-data exemptions", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tenant-gate-"));
  fs.mkdirSync(path.join(root, "packages/example/__fixtures__"), { recursive: true });
  fs.mkdirSync(path.join(root, "prisma/migrations/20260101000000_example"), { recursive: true });
  fs.writeFileSync(path.join(root, "packages/example/__fixtures__/tenant.ts"), 'export const value = "Acme X";');
  fs.writeFileSync(path.join(root, "prisma/migrations/20260101000000_example/migration.sql"), "-- Acme X");
  const result = scanRepository({ root, signals: collectTenantSignals(syntheticInput()) });
  assert.deepEqual(result.violations.map((item) => item.file), [
    "packages/example/__fixtures__/tenant.ts",
    "prisma/migrations/20260101000000_example/migration.sql",
  ]);
});

test("ignores nested Next build output from independently generated apps", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tenant-gate-next-output-"));
  fs.mkdirSync(path.join(root, "apps/finance/.next/server"), { recursive: true });
  fs.writeFileSync(path.join(root, "apps/finance/.next/server/chunk.js"), 'const company = "Acme X";');
  const result = scanRepository({ root, signals: collectTenantSignals(syntheticInput()) });
  assert.equal(result.scannedFiles, 0);
  assert.equal(result.violations.length, 0);
});

test("scans active shell and Prisma model sources", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tenant-gate-sources-"));
  fs.mkdirSync(path.join(root, "ops"), { recursive: true });
  fs.mkdirSync(path.join(root, "prisma/models"), { recursive: true });
  fs.writeFileSync(path.join(root, "ops/deploy.sh"), 'COMPANY="Acme X"\n');
  fs.writeFileSync(path.join(root, "prisma/models/company.prisma"), '/// Acme X\n');
  const result = scanRepository({ root, signals: collectTenantSignals(syntheticInput()) });
  assert.deepEqual(result.violations.map((item) => item.file), ["ops/deploy.sh", "prisma/models/company.prisma"]);
});

test("zero baseline rejects additions and stale baselines must be removed", () => {
  const violation = { key: "packages/a.ts:1:company-name:C-X" };
  assert.deepEqual(evaluateBaseline([violation], []), {
    additions: [violation.key],
    stale: [],
  });
  assert.deepEqual(evaluateBaseline([], [violation.key]), {
    additions: [],
    stale: [violation.key],
  });
});

test("structural rules catch tenant policy declarations without knowing values", () => {
  const tenantTimeZoneDeclaration = ["WORKSPACE", "BUSINESS", "TIME", "ZONE"].join("_");
  const configRootDeclaration = ["DEFAULT", "CONFIG", "ROOT"].join("_");
  const officeLocationDeclaration = ["HR", "OFFICE", "LOCATIONS"].join("_");
  const workAreaDeclaration = ["WORK", "AREA", "OPTIONS"].join("_");
  const violations = scanContent({
    relativePath: "packages/example/options.ts",
    content: `export const ${officeLocationDeclaration} = [readSomething()];\nconst ${workAreaDeclaration} = [readSomething()];\nconst ${tenantTimeZoneDeclaration} = readSomething();\nconst ${configRootDeclaration} = process.cwd();`,
    signals: [],
  });
  assert.deepEqual(violations.map((item) => item.signalId), ["tenant-hr-option-declaration", "tenant-hr-option-declaration", "tenant-business-time-zone", "qc-config-root-default"]);
});
