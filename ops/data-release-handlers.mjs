import path from "node:path";

function fail(message) {
  throw new Error(message);
}

function relativeSourcePath(value, label) {
  if (typeof value !== "string" || !value || path.isAbsolute(value) || value.includes("\\")) {
    fail(`${label} must be a POSIX path relative to the uploaded source root`);
  }
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === ".." || normalized.startsWith("../")) fail(`${label} escapes the uploaded source root`);
  return value;
}

function productMasterCommand(execution, context) {
  const parameters = execution.parameters;
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)
    || Object.keys(parameters).sort().join(",") !== "aliasFile,companyCode,inputDirectory"
    || !/^[A-Za-z0-9_-]{1,40}$/.test(parameters.companyCode ?? "")) {
    fail("product-master-v1 parameters must contain companyCode, inputDirectory, and aliasFile");
  }
  const inputDirectory = relativeSourcePath(parameters.inputDirectory, "product-master-v1 inputDirectory");
  const aliasFile = relativeSourcePath(parameters.aliasFile, "product-master-v1 aliasFile");
  return {
    executable: process.execPath,
    args: [
      path.join(context.repositoryRoot, "scripts/import/import-product-master.mjs"),
      "--execute",
      `--company-code=${parameters.companyCode}`,
      `--input-dir=${path.join(context.sourceRoot, inputDirectory)}`,
      `--alias-file=${path.join(context.sourceRoot, aliasFile)}`,
    ],
  };
}

function financeReviewedOriginMappingsCommand(execution, context) {
  const parameters = execution.parameters;
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)
    || Object.keys(parameters).sort().join(",") !== "inputFile") {
    fail("finance-reviewed-origin-mappings-v1 parameters must contain only inputFile");
  }
  const inputFile = relativeSourcePath(parameters.inputFile, "finance-reviewed-origin-mappings-v1 inputFile");
  return {
    executable: process.execPath,
    args: [
      path.join(context.repositoryRoot, "scripts/repair/repair-finance-reviewed-origin-mappings.mjs"),
      "--execute",
      `--input-file=${path.join(context.sourceRoot, inputFile)}`,
    ],
  };
}

function financeConsolidationVoucherCommand(execution, context) {
  const parameters = execution.parameters;
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)
    || Object.keys(parameters).sort().join(",") !== "inputFile") {
    fail("finance-consolidation-voucher-v1 parameters must contain only inputFile");
  }
  const inputFile = relativeSourcePath(parameters.inputFile, "finance-consolidation-voucher-v1 inputFile");
  return {
    executable: process.execPath,
    args: [
      path.join(context.repositoryRoot, "scripts/repair/repair-finance-consolidation-voucher.mjs"),
      "--execute",
      `--input-file=${path.join(context.sourceRoot, inputFile)}`,
    ],
  };
}

function financeCapitalOpeningAmountCommand(execution, context) {
  const parameters = execution.parameters;
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)
    || Object.keys(parameters).sort().join(",") !== "inputFile") {
    fail("finance-capital-opening-amount-v1 parameters must contain only inputFile");
  }
  const inputFile = relativeSourcePath(parameters.inputFile, "finance-capital-opening-amount-v1 inputFile");
  return {
    executable: process.execPath,
    args: [
      path.join(context.repositoryRoot, "scripts/repair/repair-finance-capital-opening-amount.mjs"),
      "--execute",
      `--input-file=${path.join(context.sourceRoot, inputFile)}`,
    ],
  };
}

function financeCapitalHistoricalAmountCommand(execution, context) {
  const parameters = execution.parameters;
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)
    || Object.keys(parameters).sort().join(",") !== "inputFile") {
    fail("finance-capital-historical-amount-v1 parameters must contain only inputFile");
  }
  const inputFile = relativeSourcePath(parameters.inputFile, "finance-capital-historical-amount-v1 inputFile");
  return {
    executable: process.execPath,
    args: [
      path.join(context.repositoryRoot, "scripts/repair/repair-finance-capital-historical-amount.mjs"),
      "--execute",
      `--input-file=${path.join(context.sourceRoot, inputFile)}`,
    ],
  };
}

function financeCapitalTransactionEvidenceCommand(execution, context) {
  const parameters = execution.parameters;
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)
    || Object.keys(parameters).sort().join(",") !== "inputFile") {
    fail("finance-capital-transaction-evidence-v1 parameters must contain only inputFile");
  }
  const inputFile = relativeSourcePath(parameters.inputFile, "finance-capital-transaction-evidence-v1 inputFile");
  return {
    executable: process.execPath,
    args: [
      path.join(context.repositoryRoot, "scripts/repair/repair-finance-capital-transaction-evidence.mjs"),
      "--execute",
      `--input-file=${path.join(context.sourceRoot, inputFile)}`,
    ],
  };
}

function financeConsolidationEntryMigrationCommand(execution, context) {
  const parameters = execution.parameters;
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)
    || Object.keys(parameters).sort().join(",") !== "inputFile") {
    fail("finance-consolidation-entry-migration-v1 parameters must contain only inputFile");
  }
  const inputFile = relativeSourcePath(parameters.inputFile, "finance-consolidation-entry-migration-v1 inputFile");
  return {
    executable: process.execPath,
    args: [
      path.join(context.repositoryRoot, "scripts/repair/repair-finance-consolidation-entry.mjs"),
      "--execute",
      `--input-file=${path.join(context.sourceRoot, inputFile)}`,
    ],
  };
}

function financeAuxiliaryIdentityLinksCommand(execution, context) {
  const parameters = execution.parameters;
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)
    || Object.keys(parameters).sort().join(",") !== "inputFile") {
    fail("finance-auxiliary-identity-links-v1 parameters must contain only inputFile");
  }
  const inputFile = relativeSourcePath(parameters.inputFile, "finance-auxiliary-identity-links-v1 inputFile");
  return {
    executable: process.execPath,
    args: [
      "--conditions=react-server",
      "--import",
      "tsx",
      path.join(context.repositoryRoot, "scripts/repair/repair-finance-auxiliary-identity-links.ts"),
      "--execute",
      `--input-file=${path.join(context.sourceRoot, inputFile)}`,
    ],
  };
}

function financeBudgetCommand(execution, context) {
  const parameters = execution.parameters;
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)
    || Object.keys(parameters).sort().join(",") !== "companyCode,departmentFile,referenceFile,researchFile,versionName,year"
    || !/^[A-Za-z0-9_-]{1,40}$/.test(parameters.companyCode ?? "")
    || !Number.isInteger(parameters.year) || parameters.year < 2000 || parameters.year > 2099
    || typeof parameters.versionName !== "string" || !parameters.versionName.trim()) {
    fail("finance-budget-v1 parameters must contain companyCode, year, versionName, departmentFile, researchFile, and referenceFile");
  }
  const departmentFile = relativeSourcePath(parameters.departmentFile, "finance-budget-v1 departmentFile");
  const researchFile = relativeSourcePath(parameters.researchFile, "finance-budget-v1 researchFile");
  const referenceFile = relativeSourcePath(parameters.referenceFile, "finance-budget-v1 referenceFile");
  return {
    executable: process.execPath,
    args: [
      path.join(context.repositoryRoot, "scripts/import/import-finance-budget.mjs"),
      "--execute",
      `--release-id=${context.releaseId}`,
      `--company-code=${parameters.companyCode}`,
      `--year=${parameters.year}`,
      `--version-name=${parameters.versionName}`,
      `--department-file=${path.join(context.sourceRoot, departmentFile)}`,
      `--research-file=${path.join(context.sourceRoot, researchFile)}`,
      `--reference-file=${path.join(context.sourceRoot, referenceFile)}`,
    ],
  };
}

function financeJuneCloseCutoverCommand(execution, context) {
  const parameters = execution.parameters;
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)
    || Object.keys(parameters).sort().join(",") !== "inputFile") {
    fail("finance-june-close-cutover-v1 parameters must contain only inputFile");
  }
  const inputFile = relativeSourcePath(parameters.inputFile, "finance-june-close-cutover-v1 inputFile");
  return {
    executable: process.execPath,
    args: [
      "--conditions=react-server",
      "--import",
      "tsx",
      path.join(context.repositoryRoot, "scripts/import/import-finance-june-close-cutover.ts"),
      "--execute",
      `--release-id=${context.releaseId}`,
      `--input-file=${path.join(context.sourceRoot, inputFile)}`,
    ],
  };
}

function internalCompanyReferenceBackfillCommand(execution, context) {
  const parameters = execution.parameters;
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)
    || Object.keys(parameters).sort().join(",") !== "referenceFile") {
    fail("internal-company-reference-backfill-v1 parameters must contain only referenceFile");
  }
  const referenceFile = relativeSourcePath(parameters.referenceFile, "internal-company-reference-backfill-v1 referenceFile");
  return {
    executable: process.execPath,
    args: [
      "--import",
      "tsx",
      path.join(context.repositoryRoot, "scripts/repair/backfill-internal-company-references.mjs"),
      "--execute",
      `--release-id=${context.releaseId}`,
      `--reference-file=${path.join(context.sourceRoot, referenceFile)}`,
    ],
  };
}

function hrLifecycleCompatibilityCommand(execution, context) {
  const parameters = execution.parameters;
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)
    || Object.keys(parameters).sort().join(",") !== "inputFile") {
    fail("hr-lifecycle-compatibility-v1 parameters must contain only inputFile");
  }
  const inputFile = relativeSourcePath(parameters.inputFile, "hr-lifecycle-compatibility-v1 inputFile");
  return {
    executable: process.execPath,
    args: [
      path.join(context.repositoryRoot, "scripts/repair/repair-hr-lifecycle-compatibility.mjs"),
      "--execute",
      `--input-file=${path.join(context.sourceRoot, inputFile)}`,
    ],
  };
}

function hrOrganizationBaselineCompatibilityCommand(execution, context) {
  const parameters = execution.parameters;
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)
    || Object.keys(parameters).sort().join(",") !== "inputFile") {
    fail("hr-organization-baseline-compatibility-v1 parameters must contain only inputFile");
  }
  const inputFile = relativeSourcePath(
    parameters.inputFile,
    "hr-organization-baseline-compatibility-v1 inputFile",
  );
  return {
    executable: process.execPath,
    args: [
      path.join(context.repositoryRoot, "scripts/repair/repair-hr-organization-baseline-compatibility.mjs"),
      "--execute",
      `--input-file=${path.join(context.sourceRoot, inputFile)}`,
    ],
  };
}

function hrEmploymentAgreementBaselineCommand(execution, context) {
  const parameters = execution.parameters;
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)
    || Object.keys(parameters).sort().join(",") !== "inputFile") {
    fail("hr-employment-agreement-baseline-v1 parameters must contain only inputFile");
  }
  const inputFile = relativeSourcePath(parameters.inputFile, "hr-employment-agreement-baseline-v1 inputFile");
  return {
    executable: process.execPath,
    args: [
      path.join(context.repositoryRoot, "scripts/repair/repair-hr-employment-agreement-baseline.mjs"),
      "--execute",
      `--input-file=${path.join(context.sourceRoot, inputFile)}`,
    ],
  };
}

function hrSocialInsuranceBaselineCommand(execution, context) {
  const parameters = execution.parameters;
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)
    || Object.keys(parameters).sort().join(",") !== "inputFile") {
    fail("hr-social-insurance-baseline-v1 parameters must contain only inputFile");
  }
  const inputFile = relativeSourcePath(parameters.inputFile, "hr-social-insurance-baseline-v1 inputFile");
  return {
    executable: process.execPath,
    args: [
      path.join(context.repositoryRoot, "scripts/repair/repair-hr-social-insurance-baseline.mjs"),
      "--execute",
      `--input-file=${path.join(context.sourceRoot, inputFile)}`,
    ],
  };
}

const HANDLERS = new Map([
  ["finance-auxiliary-identity-links-v1", financeAuxiliaryIdentityLinksCommand],
  ["finance-budget-v1", financeBudgetCommand],
  ["finance-june-close-cutover-v1", financeJuneCloseCutoverCommand],
  ["finance-capital-opening-amount-v1", financeCapitalOpeningAmountCommand],
  ["finance-capital-historical-amount-v1", financeCapitalHistoricalAmountCommand],
  ["finance-capital-transaction-evidence-v1", financeCapitalTransactionEvidenceCommand],
  ["finance-reviewed-origin-mappings-v1", financeReviewedOriginMappingsCommand],
  ["finance-consolidation-voucher-v1", financeConsolidationVoucherCommand],
  ["finance-consolidation-entry-migration-v1", financeConsolidationEntryMigrationCommand],
  ["hr-employment-agreement-baseline-v1", hrEmploymentAgreementBaselineCommand],
  ["hr-organization-baseline-compatibility-v1", hrOrganizationBaselineCompatibilityCommand],
  ["hr-social-insurance-baseline-v1", hrSocialInsuranceBaselineCommand],
  ["hr-lifecycle-compatibility-v1", hrLifecycleCompatibilityCommand],
  ["internal-company-reference-backfill-v1", internalCompanyReferenceBackfillCommand],
  ["product-master-v1", productMasterCommand],
]);

export function registeredDataReleaseHandlerIds() {
  return [...HANDLERS.keys()].sort();
}

export function buildDataReleaseHandlerCommand(execution, context) {
  if (!execution || typeof execution !== "object" || Array.isArray(execution)
    || typeof execution.handler !== "string") {
    fail("data release execution must select a registered handler");
  }
  const handler = HANDLERS.get(execution.handler);
  if (!handler) fail(`data release handler is not registered in source: ${execution.handler}`);
  return handler(execution, context);
}
