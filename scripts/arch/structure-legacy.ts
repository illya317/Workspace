import ts from "typescript";

type ImportRecord = {
  kind: "static" | "dynamic";
  specifier: string;
};

type SourceInfo = {
  absPath: string;
  relPath: string;
  text: string;
  sourceFile: ts.SourceFile;
  imports: ImportRecord[];
  hasJsx: boolean;
};

const LEGACY_ROOT_UTILITY_FILES = new Set([
  "lib/company-server.ts",
  "lib/crud-factory.ts",
  "lib/crud-finance.ts",
  "lib/crud-inventory.ts",
  "lib/crud.ts",
  "lib/schemas.ts",
  "lib/validation.ts",
]);

const LEGACY_ROOT_PERIOD_FILES = new Set([
  "lib/period-core.ts",
  "lib/period-options.ts",
  "lib/period-types.ts",
  "lib/period.ts",
]);

export function findLegacyServiceFiles(files: SourceInfo[]) {
  return files
    .filter((file) => file.relPath.startsWith("server/services/"))
    .map((file) => file.relPath)
    .sort();
}

export function findLegacyAuthHubFiles(files: SourceInfo[]) {
  return files
    .filter((file) => file.relPath === "lib/auth.ts")
    .map((file) => file.relPath)
    .sort();
}

export function findLegacyRootAccessFiles(files: SourceInfo[]) {
  return files
    .filter((file) => file.relPath === "lib/access.ts")
    .map((file) => file.relPath)
    .sort();
}

export function findLegacyRootUtilityFiles(files: SourceInfo[]) {
  return files
    .filter((file) => LEGACY_ROOT_UTILITY_FILES.has(file.relPath))
    .map((file) => file.relPath)
    .sort();
}

export function findLegacyRootWithAuthFiles(files: SourceInfo[]) {
  return files
    .filter((file) => file.relPath === "lib/with-auth.ts")
    .map((file) => file.relPath)
    .sort();
}

export function findLegacyRootWithAuthImports(files: SourceInfo[]) {
  return files
    .flatMap((file) => (
      file.imports
        .filter((item) => item.specifier === "@/lib/with-auth")
        .map((item) => `${file.relPath}: ${item.specifier}`)
    ))
    .sort();
}

export function findLegacyRootPrismaFiles(files: SourceInfo[]) {
  return files
    .filter((file) => file.relPath === "lib/prisma.ts")
    .map((file) => file.relPath)
    .sort();
}

function isLegacyRootPrismaSpecifier(specifier: string) {
  return specifier === "@/lib/prisma" ||
    specifier === "./lib/prisma" ||
    /^(?:\.\.\/)+lib\/prisma$/.test(specifier);
}

export function findLegacyRootPrismaImports(files: SourceInfo[]) {
  return files
    .flatMap((file) => (
      file.imports
        .filter((item) => isLegacyRootPrismaSpecifier(item.specifier))
        .map((item) => `${file.relPath}: ${item.specifier}`)
    ))
    .sort();
}

function isLegacyRootPermissionsSpecifier(specifier: string) {
  return specifier === "@/lib/permissions" ||
    specifier === "./lib/permissions" ||
    /^(?:\.\.\/)+lib\/permissions$/.test(specifier);
}

function isPurePlatformPermissionsReExport(file: SourceInfo) {
  return file.imports.length === 1 &&
    file.imports[0]?.specifier === "@workspace/platform/permissions" &&
    file.sourceFile.statements.every((statement) => (
      ts.isExportDeclaration(statement) ||
      statement.kind === ts.SyntaxKind.EndOfFileToken
    ));
}

export function findLegacyRootPermissionsImplementationFiles(files: SourceInfo[]) {
  return files
    .filter((file) => file.relPath === "lib/permissions.ts")
    .filter((file) => !isPurePlatformPermissionsReExport(file))
    .map((file) => file.relPath)
    .sort();
}

export function findLegacyRootPermissionsImports(files: SourceInfo[]) {
  return files
    .flatMap((file) => (
      file.imports
        .filter((item) => isLegacyRootPermissionsSpecifier(item.specifier))
        .map((item) => `${file.relPath}: ${item.specifier}`)
    ))
    .sort();
}

function isLegacyRootPeriodSpecifier(specifier: string) {
  return specifier === "@/lib/period" ||
    specifier === "@/lib/period-core" ||
    specifier === "@/lib/period-options" ||
    specifier === "@/lib/period-types" ||
    specifier === "./lib/period" ||
    specifier === "./lib/period-core" ||
    specifier === "./lib/period-options" ||
    specifier === "./lib/period-types" ||
    /^(?:\.\.\/)+lib\/period(?:-(?:core|options|types))?$/.test(specifier);
}

function isPureCorePeriodReExport(file: SourceInfo) {
  return file.imports.length > 0 &&
    file.imports.every((item) => item.specifier === "@workspace/core/period") &&
    file.sourceFile.statements.every((statement) => (
      ts.isExportDeclaration(statement) ||
      statement.kind === ts.SyntaxKind.EndOfFileToken
    ));
}

export function findLegacyRootPeriodImplementationFiles(files: SourceInfo[]) {
  return files
    .filter((file) => LEGACY_ROOT_PERIOD_FILES.has(file.relPath))
    .filter((file) => !isPureCorePeriodReExport(file))
    .map((file) => file.relPath)
    .sort();
}

export function findLegacyRootPeriodImports(files: SourceInfo[]) {
  return files
    .flatMap((file) => (
      file.imports
        .filter((item) => isLegacyRootPeriodSpecifier(item.specifier))
        .map((item) => `${file.relPath}: ${item.specifier}`)
    ))
    .sort();
}

export function findLegacyRootSearchSchemaFiles(files: SourceInfo[]) {
  return files
    .filter((file) => file.relPath === "lib/search-schema.ts")
    .map((file) => file.relPath)
    .sort();
}
