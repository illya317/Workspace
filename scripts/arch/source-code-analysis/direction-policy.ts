import { createRequire } from "node:module";

import type {
  SourceCodeAnalysisDependencyKind,
  SourceCodeAnalysisInvalidDirectionReason,
  SourceCodeAnalysisRole,
} from "../../../packages/platform/source-code-analysis-contract";

const require = createRequire(import.meta.url);
const packagePolicy = require("../package-dependency-policy.cjs") as {
  PACKAGE_NAMES: readonly string[];
  isPackageDependencyAllowed(sourcePackage: string, targetPackage: string): boolean;
  packageDefinition(packageName: string): { tier: string };
  packageTierOrder(packageName: string): number;
};

interface DirectionPolicyFile {
  path: string;
  moduleKey: string;
  role: SourceCodeAnalysisRole;
}

const EXCLUDED_MODULES = new Set(["operations", "tooling"]);
const NON_PRODUCTION_ROLES = new Set<SourceCodeAnalysisRole>(["test", "tooling"]);
const PACKAGE_MODULES = new Set(packagePolicy.PACKAGE_NAMES);
const SPECIAL_MODULE_LAYERS = new Map<string, number>([
  ["application-shell", 0],
  ["data-model", packagePolicy.packageTierOrder("core")],
]);

const ROLE_ORDER: Partial<Record<SourceCodeAnalysisRole, number>> = {
  composition: 0,
  assembly: 0,
  ui: 1,
  input: 1,
  application: 2,
  persistence: 3,
  integration: 3,
  domainValidation: 4,
  domain: 5,
  contract: 6,
};

const ALLOWED_ROLE_TARGETS: Partial<Record<SourceCodeAnalysisRole, ReadonlySet<SourceCodeAnalysisRole>>> = {
  composition: new Set(["composition", "assembly", "ui", "input", "application", "persistence", "integration", "domainValidation", "domain", "contract"]),
  assembly: new Set(["composition", "assembly", "ui", "input", "application", "persistence", "integration", "domainValidation", "domain", "contract"]),
  ui: new Set(["ui", "input", "application", "integration", "domainValidation", "domain", "contract"]),
  input: new Set(["input", "application", "domainValidation", "domain", "contract"]),
  application: new Set(["application", "persistence", "integration", "domainValidation", "domain", "contract"]),
  persistence: new Set(["persistence", "integration", "domainValidation", "domain", "contract"]),
  integration: new Set(["persistence", "integration", "domainValidation", "domain", "contract"]),
  domainValidation: new Set(["domainValidation", "domain", "contract"]),
  domain: new Set(["domainValidation", "domain", "contract"]),
  contract: new Set(["contract"]),
};

function moduleLayer(moduleKey: string) {
  if (EXCLUDED_MODULES.has(moduleKey)) return null;
  if (PACKAGE_MODULES.has(moduleKey)) return packagePolicy.packageTierOrder(moduleKey);
  const specialLayer = SPECIAL_MODULE_LAYERS.get(moduleKey);
  if (specialLayer !== undefined) return specialLayer;
  throw new Error(`[source-code-analysis] module ${moduleKey} is missing from the package dependency tier policy`);
}

function assemblyExposedRole(file: DirectionPolicyFile): SourceCodeAnalysisRole {
  if (/\/(?:ui|showcase)(?:\/|$)/.test(file.path) || /(?:^|\/)ui-registry\.[^.]+$/.test(file.path)) return "ui";
  if (/\/(?:types|constants)(?:\/|$)/.test(file.path) || /(?:contract|types?|constants?)\.[^.]+$/.test(file.path)) return "contract";
  if (/\/(?:server|import)(?:\/|$)/.test(file.path)) return "application";
  return "contract";
}

function isPackageRootAssembly(file: DirectionPolicyFile) {
  return /^packages\/[^/]+\/index\.[cm]?[jt]sx?$/.test(file.path);
}

function invalidModuleDirection(
  source: DirectionPolicyFile,
  target: DirectionPolicyFile,
): SourceCodeAnalysisInvalidDirectionReason | null {
  if (source.moduleKey === target.moduleKey) return null;
  const sourceLayer = moduleLayer(source.moduleKey);
  const targetLayer = moduleLayer(target.moduleKey);
  if (sourceLayer === null || targetLayer === null) return null;
  if (PACKAGE_MODULES.has(source.moduleKey) && PACKAGE_MODULES.has(target.moduleKey)) {
    if (packagePolicy.isPackageDependencyAllowed(source.moduleKey, target.moduleKey)) return null;
    return packagePolicy.packageDefinition(source.moduleKey).tier === packagePolicy.packageDefinition(target.moduleKey).tier
      ? "crossBusinessDependency"
      : "upwardModuleDependency";
  }
  return sourceLayer > targetLayer ? "upwardModuleDependency" : null;
}

function isCompositionRootAssemblyImport(source: DirectionPolicyFile) {
  return source.role === "composition"
    && (source.moduleKey === "application-shell" || source.path.startsWith("app/"));
}

export function invalidDependencyDirectionReason(
  source: DirectionPolicyFile,
  target: DirectionPolicyFile,
  kind: SourceCodeAnalysisDependencyKind,
): SourceCodeAnalysisInvalidDirectionReason | null {
  if (EXCLUDED_MODULES.has(source.moduleKey)) return null;
  if (source.role === "test" || source.role === "tooling") return null;
  if (target.role === "test") return "productionImportsTest";
  if (target.role === "tooling" || EXCLUDED_MODULES.has(target.moduleKey)) return "productionImportsTooling";

  const moduleViolation = invalidModuleDirection(source, target);
  if (moduleViolation) return moduleViolation;

  if (target.role === "assembly" && isPackageRootAssembly(target) && !isCompositionRootAssemblyImport(source)) {
    return source.moduleKey === target.moduleKey
      ? "implementationImportsOwnAssembly"
      : "forbiddenLayerShortcut";
  }
  if (source.role === "assembly") {
    return kind === "reExport" || kind === "typeOnlyReExport" ? null : "forbiddenLayerShortcut";
  }
  let targetRole: SourceCodeAnalysisRole = target.role;
  if (targetRole === "assembly") {
    targetRole = assemblyExposedRole(target);
  }
  if (NON_PRODUCTION_ROLES.has(target.role)) return "productionImportsTooling";

  const allowedTargets = ALLOWED_ROLE_TARGETS[source.role];
  if (allowedTargets?.has(targetRole)) return null;
  const sourceOrder = ROLE_ORDER[source.role];
  const targetOrder = ROLE_ORDER[targetRole];
  return sourceOrder !== undefined && targetOrder !== undefined && targetOrder < sourceOrder
    ? "reverseRoleDependency"
    : "forbiddenLayerShortcut";
}
