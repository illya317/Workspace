import ts from "typescript";

import {
  coreUiComponentRegistry,
  registeredCoreUiComponentNames,
} from "../../packages/core/ui/component-registry";
import type { SourceInfo } from "./structure-ui";

export type UnregisteredCoreUiImport = {
  file: string;
  importedName: string;
  specifier: string;
};

export type BusinessCoreUiRoleBypassImport = {
  file: string;
  importedName: string;
  specifier: string;
  role: string;
  reason: string;
};

export type UiForbiddenCoreUiTypeImport = {
  file: string;
  importedName: string;
  specifier: string;
};

export type PlatformCoreUiRoleBypassImport = {
  file: string;
  importedName: string;
  specifier: string;
  role: string;
  reason: string;
};

export type UnregisteredCoreUiExport = {
  exportedName: string;
};

export type DuplicateCoreUiRegistration = {
  name: string;
  count: number;
};

const CORE_UI_NON_COMPONENT_EXPORTS = new Set<string>([
  "ActionGlyph",
  "FLOATING_OVERLAY_OPEN_EVENT",
  "announceFloatingOverlayOpen",
  "createActionsBlock",
  "createAnalysisBlock",
  "createBlockSurfaceBlock",
  "createCreatePanelBlock",
  "createDocumentBlock",
  "createEmptyBlock",
  "createFieldsBlock",
  "createFormBlock",
  "createGroupBlock",
  "createHeadingBlock",
  "createInlineFieldsBlock",
  "createMessageBlock",
  "createModuleGridBlock",
  "createPageActionsBlock",
  "createPageCommand",
  "createPageDataBlock",
  "createPageFieldsBlock",
  "createPageFormBlock",
  "createPageFormModalBlock",
  "createPageInlineFieldsBlock",
  "createPageModalBlock",
  "createPageSurfaceProps",
  "createPageTableBlock",
  "createPanelBlock",
  "createSectionBlock",
  "createSelectorPanelBlock",
  "createVisualizationBlock",
  "getFloatingOverlayOpenDetail",
  "useFeedback",
]);
const CORE_UI_BUSINESS_IMPORT_ROLES = new Set(["surface", "helper", "service"]);
const CORE_UI_ALLOWED_HOST_IMPORTS = new Set<string>();
const FORBIDDEN_CORE_UI_TYPE_IMPORTS = new Set([
  "DataTableColumn",
  "FkFieldOption",
  "ToolbarItem",
]);

function coreUiDeepImportName(specifier: string) {
  const prefix = "@workspace/core/ui/";
  if (!specifier.startsWith(prefix)) return null;
  const name = specifier.slice(prefix.length).split("/")[0];
  return name && name !== "component-registry" ? name : null;
}

function isCoreUiDeepImport(specifier: string) {
  return specifier.startsWith("@workspace/core/ui/");
}

function exportModuleSpecifier(statement: ts.ExportDeclaration) {
  const specifier = statement.moduleSpecifier;
  return specifier && ts.isStringLiteral(specifier) ? specifier.text : null;
}

function namedExportNames(statement: ts.ExportDeclaration) {
  const exportClause = statement.exportClause;
  if (!exportClause || !ts.isNamedExports(exportClause)) return null;
  return exportClause.elements.map((element) => element.propertyName?.text ?? element.name.text);
}

function collectCoreUiPublicTypeExports(files: SourceInfo[]) {
  const indexFile = files.find((file) => file.relPath === "packages/core/ui/index.ts");
  if (!indexFile) return new Set<string>();
  const exports = new Set<string>();
  for (const statement of indexFile.sourceFile.statements) {
    if (!ts.isExportDeclaration(statement) || !statement.isTypeOnly) continue;
    const exportClause = statement.exportClause;
    if (!exportClause || !ts.isNamedExports(exportClause)) continue;
    for (const element of exportClause.elements) {
      exports.add(element.name.text);
    }
  }
  return exports;
}

const coreUiRegistrationByName = new Map(coreUiComponentRegistry.map((component) => [component.name, component]));

function isAllowedCoreUiBusinessImport(importedName: string) {
  if (CORE_UI_NON_COMPONENT_EXPORTS.has(importedName)) return true;
  const component = coreUiRegistrationByName.get(importedName);
  if (!component) return false;
  if (component.role && CORE_UI_BUSINESS_IMPORT_ROLES.has(component.role)) return true;
  if (component.role === "host" && CORE_UI_ALLOWED_HOST_IMPORTS.has(component.name)) return true;
  return false;
}

function describeCoreUiBusinessImportViolation(importedName: string) {
  const component = coreUiRegistrationByName.get(importedName);
  if (!component) {
    return {
      role: "unregistered",
      reason: "not registered as a Core UI surface/helper/service",
    };
  }
  if (component.role === "host") {
    return {
      role: component.role,
      reason: "host import requires explicit allowlist",
    };
  }
  return {
    role: component.role ?? "unknown",
    reason: "business import must use role=surface/helper/service",
  };
}

function collectCoreUiRoleBypassExports(file: SourceInfo) {
  const candidates: BusinessCoreUiRoleBypassImport[] = [];
  for (const statement of file.sourceFile.statements) {
    if (!ts.isExportDeclaration(statement)) continue;
    const specifier = exportModuleSpecifier(statement);
    if (!specifier) continue;

    if (isCoreUiDeepImport(specifier)) {
      const deepImportName = coreUiDeepImportName(specifier) ?? specifier.slice("@workspace/core/ui/".length);
      candidates.push({
        file: file.relPath,
        importedName: deepImportName,
        specifier,
        role: "deep-import",
        reason: "business/platform UI must import Core UI through @workspace/core/ui public surface/helper/service declarations",
      });
      continue;
    }

    if (specifier !== "@workspace/core/ui") continue;
    const exportedNames = namedExportNames(statement);
    if (!exportedNames) {
      candidates.push({
        file: file.relPath,
        importedName: "*",
        specifier,
        role: "namespace/default",
        reason: "export * cannot be checked against Core UI role",
      });
      continue;
    }

    for (const exportedName of exportedNames) {
      if (!isAllowedCoreUiBusinessImport(exportedName)) {
        candidates.push({
          file: file.relPath,
          importedName: exportedName,
          specifier,
          ...describeCoreUiBusinessImportViolation(exportedName),
        });
      }
    }
  }
  return candidates;
}

function collectCoreUiRoleBypassTypeImports(file: SourceInfo, publicTypeExports: Set<string>) {
  const candidates: BusinessCoreUiRoleBypassImport[] = [];
  for (const statement of file.sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text !== "@workspace/core/ui") continue;
    const importClause = statement.importClause;
    const namedBindings = importClause?.namedBindings;
    if (!importClause || !namedBindings || !ts.isNamedImports(namedBindings)) continue;

    for (const element of namedBindings.elements) {
      const isTypeOnly = importClause.isTypeOnly || element.isTypeOnly;
      if (!isTypeOnly) continue;
      const importedName = element.propertyName?.text ?? element.name.text;
      if (publicTypeExports.has(importedName)) continue;
      candidates.push({
        file: file.relPath,
        importedName,
        specifier: "@workspace/core/ui",
        role: "type",
        reason: "type import must be an explicit public Core UI surface/helper/service contract export",
      });
    }
  }
  return candidates;
}

function isBusinessUiSurfaceScanFile(file: SourceInfo) {
  if (!/\.(ts|tsx)$/.test(file.relPath)) return false;
  if (file.relPath.startsWith("app/(modules)/")) return true;

  const match = /^packages\/([^/]+)\/ui\//.exec(file.relPath);
  return Boolean(match && BUSINESS_PACKAGE_NAMES.has(match[1]));
}

function isBusinessCoreUiTypeScanFile(file: SourceInfo) {
  if (!/\.(ts|tsx)$/.test(file.relPath)) return false;
  if (file.relPath.startsWith("packages/core/")) return false;
  if (file.relPath.startsWith("app/")) return true;
  return /^packages\/[^/]+\/ui\//.test(file.relPath);
}

function isPlatformUiRuntimeScanFile(file: SourceInfo) {
  return /\.(ts|tsx)$/.test(file.relPath) && file.relPath.startsWith("packages/platform/ui/");
}

const BUSINESS_PACKAGE_NAMES = new Set([
  "administration",
  "external",
  "finance",
  "hr",
  "library",
  "production",
  "work",
]);

export function findUnregisteredCoreUiImports(files: SourceInfo[]) {
  const candidates: UnregisteredCoreUiImport[] = [];

  for (const file of files) {
    if (file.relPath.startsWith("packages/core/")) continue;

    for (const statement of file.sourceFile.statements) {
      if (!ts.isImportDeclaration(statement)) continue;
      if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      const importClause = statement.importClause;
      if (!importClause) continue;

      if (isCoreUiDeepImport(specifier)) {
        candidates.push({
          file: file.relPath,
          importedName: coreUiDeepImportName(specifier) ?? specifier.slice("@workspace/core/ui/".length),
          specifier,
        });
        continue;
      }

      if (importClause.isTypeOnly) continue;

      if (specifier === "@workspace/core/ui") {
        const namedBindings = importClause.namedBindings;
        if (!namedBindings || !ts.isNamedImports(namedBindings)) continue;
        for (const element of namedBindings.elements) {
          if (element.isTypeOnly) continue;
          const importedName = element.propertyName?.text ?? element.name.text;
          if (
            !registeredCoreUiComponentNames.has(importedName) &&
            !CORE_UI_NON_COMPONENT_EXPORTS.has(importedName)
          ) {
            candidates.push({ file: file.relPath, importedName, specifier });
          }
        }
        continue;
      }

    }

    for (const statement of file.sourceFile.statements) {
      if (!ts.isExportDeclaration(statement)) continue;
      const specifier = exportModuleSpecifier(statement);
      if (!specifier) continue;

      if (specifier === "@workspace/core/ui") {
        const exportedNames = namedExportNames(statement);
        if (!exportedNames) continue;
        for (const exportedName of exportedNames) {
          if (
            !registeredCoreUiComponentNames.has(exportedName) &&
            !CORE_UI_NON_COMPONENT_EXPORTS.has(exportedName)
          ) {
            candidates.push({ file: file.relPath, importedName: exportedName, specifier });
          }
        }
        continue;
      }

      if (isCoreUiDeepImport(specifier)) {
        candidates.push({
          file: file.relPath,
          importedName: coreUiDeepImportName(specifier) ?? specifier.slice("@workspace/core/ui/".length),
          specifier,
        });
      }
    }
  }

  return candidates.sort((left, right) => `${left.file}:${left.importedName}`.localeCompare(`${right.file}:${right.importedName}`));
}

export function findBusinessCoreUiRoleBypassImports(files: SourceInfo[]) {
  const candidates: BusinessCoreUiRoleBypassImport[] = [];
  const publicTypeExports = collectCoreUiPublicTypeExports(files);

  for (const file of files) {
    if (!isBusinessUiSurfaceScanFile(file)) continue;

    for (const statement of file.sourceFile.statements) {
      if (!ts.isImportDeclaration(statement)) continue;
      if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      const importClause = statement.importClause;
      if (!importClause) continue;

      const deepImportName = coreUiDeepImportName(specifier);
      if (deepImportName) {
        candidates.push({
          file: file.relPath,
          importedName: deepImportName,
          specifier,
          role: "deep-import",
          reason: "business UI must import Core UI through @workspace/core/ui public surface/helper/service declarations",
        });
        continue;
      }

      if (importClause.isTypeOnly) continue;
      if (specifier !== "@workspace/core/ui") continue;

      if (importClause.name) {
        candidates.push({
          file: file.relPath,
          importedName: importClause.name.text,
          specifier,
          role: "namespace/default",
          reason: "namespace/default import cannot be checked against Core UI role",
        });
      }

      const namedBindings = importClause.namedBindings;
      if (!namedBindings) continue;

      if (ts.isNamespaceImport(namedBindings)) {
        candidates.push({
          file: file.relPath,
          importedName: namedBindings.name.text,
          specifier,
          role: "namespace/default",
          reason: "namespace/default import cannot be checked against Core UI role",
        });
        continue;
      }

      for (const element of namedBindings.elements) {
        if (element.isTypeOnly) continue;
        const importedName = element.propertyName?.text ?? element.name.text;
        if (!isAllowedCoreUiBusinessImport(importedName)) {
          candidates.push({
            file: file.relPath,
            importedName,
            specifier,
            ...describeCoreUiBusinessImportViolation(importedName),
          });
        }
      }
    }

    candidates.push(...collectCoreUiRoleBypassExports(file));
    candidates.push(...collectCoreUiRoleBypassTypeImports(file, publicTypeExports));
  }

  return candidates.sort((left, right) => `${left.file}:${left.importedName}`.localeCompare(`${right.file}:${right.importedName}`));
}

export function findUiForbiddenCoreUiTypeImports(files: SourceInfo[]) {
  const candidates: UiForbiddenCoreUiTypeImport[] = [];

  for (const file of files) {
    if (!isBusinessCoreUiTypeScanFile(file)) continue;

    for (const statement of file.sourceFile.statements) {
      if (!ts.isImportDeclaration(statement)) continue;
      if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      if (specifier !== "@workspace/core/ui") continue;

      const importClause = statement.importClause;
      if (!importClause) continue;

      const namedBindings = importClause.namedBindings;
      if (!namedBindings || !ts.isNamedImports(namedBindings)) continue;

      for (const element of namedBindings.elements) {
        const isTypeOnly = importClause.isTypeOnly || element.isTypeOnly;
        if (!isTypeOnly) continue;

        const importedName = element.propertyName?.text ?? element.name.text;
        if (FORBIDDEN_CORE_UI_TYPE_IMPORTS.has(importedName)) {
          candidates.push({ file: file.relPath, importedName, specifier });
        }
      }
    }
  }

  return candidates.sort((left, right) => `${left.file}:${left.importedName}`.localeCompare(`${right.file}:${right.importedName}`));
}

export function findPlatformCoreUiRoleBypassImports(files: SourceInfo[]) {
  const candidates: PlatformCoreUiRoleBypassImport[] = [];
  const publicTypeExports = collectCoreUiPublicTypeExports(files);

  for (const file of files) {
    if (!isPlatformUiRuntimeScanFile(file)) continue;

    for (const statement of file.sourceFile.statements) {
      if (!ts.isImportDeclaration(statement)) continue;
      if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      const importClause = statement.importClause;
      if (!importClause) continue;

      const deepImportName = coreUiDeepImportName(specifier);
      if (deepImportName) {
        candidates.push({
          file: file.relPath,
          importedName: deepImportName,
          specifier,
          role: "deep-import",
          reason: "platform UI runtime must import Core UI through @workspace/core/ui public surface/helper/service declarations",
        });
        continue;
      }

      if (importClause.isTypeOnly) continue;
      if (specifier !== "@workspace/core/ui") continue;

      if (importClause.name) {
        candidates.push({
          file: file.relPath,
          importedName: importClause.name.text,
          specifier,
          role: "namespace/default",
          reason: "namespace/default import cannot be checked against Core UI role",
        });
      }

      const namedBindings = importClause.namedBindings;
      if (!namedBindings) continue;

      if (ts.isNamespaceImport(namedBindings)) {
        candidates.push({
          file: file.relPath,
          importedName: namedBindings.name.text,
          specifier,
          role: "namespace/default",
          reason: "namespace/default import cannot be checked against Core UI role",
        });
        continue;
      }

      for (const element of namedBindings.elements) {
        if (element.isTypeOnly) continue;
        const importedName = element.propertyName?.text ?? element.name.text;
        if (!isAllowedCoreUiBusinessImport(importedName)) {
          candidates.push({
            file: file.relPath,
            importedName,
            specifier,
            ...describeCoreUiBusinessImportViolation(importedName),
          });
        }
      }
    }
    candidates.push(...collectCoreUiRoleBypassExports(file));
    candidates.push(...collectCoreUiRoleBypassTypeImports(file, publicTypeExports));
  }

  return candidates.sort((left, right) => `${left.file}:${left.importedName}`.localeCompare(`${right.file}:${right.importedName}`));
}

function collectCoreUiValueExports(files: SourceInfo[]) {
  const indexFile = files.find((file) => file.relPath === "packages/core/ui/index.ts");
  if (!indexFile) return [];

  const exports = new Set<string>();

  for (const statement of indexFile.sourceFile.statements) {
    if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) continue;
    if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue;

    for (const element of statement.exportClause.elements) {
      if (element.isTypeOnly) continue;
      exports.add(element.name.text);
    }
  }

  return [...exports].sort();
}

export function findUnregisteredCoreUiExports(files: SourceInfo[]) {
  return collectCoreUiValueExports(files)
    .filter((exportedName) => !registeredCoreUiComponentNames.has(exportedName))
    .filter((exportedName) => !CORE_UI_NON_COMPONENT_EXPORTS.has(exportedName))
    .map((exportedName) => ({ exportedName }))
    .sort((left, right) => left.exportedName.localeCompare(right.exportedName));
}

export function findDuplicateCoreUiRegistrations() {
  const counts = new Map<string, number>();

  for (const component of coreUiComponentRegistry) {
    counts.set(component.name, (counts.get(component.name) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => left.name.localeCompare(right.name));
}
