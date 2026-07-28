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
  ["finance-reviewed-origin-mappings-v1", financeReviewedOriginMappingsCommand],
  ["finance-consolidation-voucher-v1", financeConsolidationVoucherCommand],
  ["hr-employment-agreement-baseline-v1", hrEmploymentAgreementBaselineCommand],
  ["hr-organization-baseline-compatibility-v1", hrOrganizationBaselineCompatibilityCommand],
  ["hr-social-insurance-baseline-v1", hrSocialInsuranceBaselineCommand],
  ["hr-lifecycle-compatibility-v1", hrLifecycleCompatibilityCommand],
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
