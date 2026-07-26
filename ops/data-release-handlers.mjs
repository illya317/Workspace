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

const HANDLERS = new Map([
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
